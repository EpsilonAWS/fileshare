/**
 * MSW fake API that follows shared/types.ts exactly.
 *
 * Real flow: create an upload on "/", open the share link in another tab.
 *
 * Fixed tokens for testing error screens. Add any 43-character key after #, e.g.
 *   /vault/demo-expired#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
 *   demo-notfound   → NOT_FOUND
 *   demo-expired    → EXPIRED
 *   demo-exhausted  → EXHAUSTED
 *   demo-lockedout  → LOCKED_OUT
 *   demo-ratelimit  → RATE_LIMITED on unlock
 */
import { delay, http, HttpResponse } from "msw";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  API,
  DOWNLOAD_URL_TTL_SECONDS,
  ERROR_STATUS,
  EXPIRY_SECONDS,
  MAX_CIPHERTEXT_BYTES,
  MAX_PASSKEY_ATTEMPTS,
  UPLOAD_URL_TTL_SECONDS,
  type ApiError,
  type CompleteUploadResponse,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type DownloadResponse,
  type ErrorCode,
  type ErrorDetails,
  type UnlockRequest,
  type UnlockResponse,
  type VaultStatusResponse,
} from "@shared/types";
import { getBlob, putBlob, vaults, type MockVault } from "./store";

const now = () => new Date().toISOString();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const randomId = (bytes = 16) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fail(code: ErrorCode, message: string, details?: ErrorDetails): Response {
  return HttpResponse.json<ApiError>(
    { error: { code, message, details } },
    { status: ERROR_STATUS[code] },
  );
}

const FIXED_ERRORS: Record<string, [ErrorCode, string, ErrorDetails?]> = {
  "demo-notfound": ["NOT_FOUND", "This link does not exist"],
  "demo-expired": ["EXPIRED", "This file has expired"],
  "demo-exhausted": ["EXHAUSTED", "No downloads remaining"],
  "demo-lockedout": ["LOCKED_OUT", "Too many wrong attempts", { retryAfterSeconds: 0 }],
};

/** Returns an error response if the vault can't be accessed, else the vault. */
function check(token: string): MockVault | Response {
  const fixed = FIXED_ERRORS[token];
  if (fixed) return fail(...fixed);
  const v = vaults.get(token);
  if (!v) return fail("NOT_FOUND", "This link does not exist");
  if (!v.completedAt) return fail("UPLOAD_INCOMPLETE", "Upload not finished");
  if (v.expiresAt && new Date(v.expiresAt) <= new Date()) return fail("EXPIRED", "This file has expired");
  if (v.downloadsRemaining <= 0) return fail("EXHAUSTED", "No downloads remaining");
  if (v.failedAttempts >= MAX_PASSKEY_ATTEMPTS) return fail("LOCKED_OUT", "Too many wrong attempts");
  return v;
}

// Access tokens live only for this page load (fine for dev).
const accessTokens = new Map<string, { shareToken: string; expiresAt: number }>();

export const handlers = [
  // 1. Create upload
  http.post(API.createUpload(), async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as CreateUploadRequest;
    if (body.sizeBytes > MAX_CIPHERTEXT_BYTES) return fail("FILE_TOO_LARGE", "Max 100 MB");
    if (!body.encryptedMeta) return fail("VALIDATION_ERROR", "encryptedMeta is required");

    const uploadId = randomId();
    const shareToken = randomId(24);
    vaults.put({
      uploadId,
      shareToken,
      sizeBytes: body.sizeBytes,
      expiry: body.expiry,
      maxDownloads: body.maxDownloads,
      downloadsRemaining: body.maxDownloads,
      encryptedMeta: body.encryptedMeta,
      authToken: body.passkeyProtection?.authToken,
      kdf: body.passkeyProtection?.kdf,
      failedAttempts: 0,
    });

    return HttpResponse.json<CreateUploadResponse>({
      uploadId,
      shareToken,
      uploadUrl: `/mock-storage/${uploadId}`,
      uploadHeaders: { "Content-Type": "application/octet-stream" },
      uploadUrlExpiresAt: inSeconds(UPLOAD_URL_TTL_SECONDS),
    });
  }),

  // Fake R2: PUT / GET the encrypted blob
  http.put("/mock-storage/:id", async ({ params, request }) => {
    await delay(800);
    await putBlob(params.id as string, await request.blob());
    return new HttpResponse(null, { status: 200 });
  }),
  http.get("/mock-storage/:id", async ({ params }) => {
    const blob = await getBlob(params.id as string);
    if (!blob) return new HttpResponse(null, { status: 404 });
    return new HttpResponse(blob, { headers: { "Content-Type": "application/octet-stream" } });
  }),

  // 2. Complete upload
  http.post("/api/uploads/:uploadId/complete", async ({ params }) => {
    await delay(200);
    const v = vaults.byUploadId(params.uploadId as string);
    if (!v) return fail("NOT_FOUND", "Unknown upload");
    v.completedAt = now();
    v.expiresAt = inSeconds(EXPIRY_SECONDS[v.expiry]);
    vaults.put(v);
    return HttpResponse.json<CompleteUploadResponse>({
      shareToken: v.shareToken,
      expiresAt: v.expiresAt,
      maxDownloads: v.maxDownloads,
      serverTime: now(),
    });
  }),

  // 3. Vault status
  http.get("/api/vault/:token", async ({ params }) => {
    await delay(200);
    const v = check(params.token as string);
    if (v instanceof Response) return v;
    return HttpResponse.json<VaultStatusResponse>({
      requiresPasskey: Boolean(v.authToken),
      kdf: v.kdf,
      serverTime: now(),
    });
  }),

  // 4. Unlock
  http.post("/api/vault/:token/unlock", async ({ params, request }) => {
    await delay(400);
    const token = params.token as string;
    if (token === "demo-ratelimit") return fail("RATE_LIMITED", "Slow down", { retryAfterSeconds: 30 });
    const v = check(token);
    if (v instanceof Response) return v;

    const body = (await request.json().catch(() => ({}))) as UnlockRequest;
    if (v.authToken) {
      if (!body.authToken) return fail("PASSKEY_REQUIRED", "Passkey required");
      if (body.authToken !== v.authToken) {
        v.failedAttempts++;
        vaults.put(v);
        const left = MAX_PASSKEY_ATTEMPTS - v.failedAttempts;
        return left <= 0
          ? fail("LOCKED_OUT", "Too many wrong attempts")
          : fail("WRONG_PASSKEY", "Wrong passkey", { attemptsRemaining: left });
      }
    }

    const accessToken = randomId();
    const expiresAt = Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;
    accessTokens.set(accessToken, { shareToken: token, expiresAt });
    return HttpResponse.json<UnlockResponse>({
      accessToken,
      accessTokenExpiresAt: new Date(expiresAt).toISOString(),
      meta: {
        encryptedMeta: v.encryptedMeta,
        sizeBytes: v.sizeBytes,
        expiresAt: v.expiresAt!,
        downloadsRemaining: v.downloadsRemaining,
        maxDownloads: v.maxDownloads,
        serverTime: now(),
      },
    });
  }),

  // 5. Download
  http.post("/api/vault/:token/download", async ({ params, request }) => {
    await delay(200);
    const token = params.token as string;
    const bearer = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    const session = accessTokens.get(bearer);
    if (!session || session.shareToken !== token || session.expiresAt < Date.now()) {
      return fail("ACCESS_TOKEN_INVALID", "Unlock again");
    }
    const v = check(token);
    if (v instanceof Response) return v;

    v.downloadsRemaining--;
    vaults.put(v);
    return HttpResponse.json<DownloadResponse>({
      downloadUrl: `/mock-storage/${v.uploadId}`,
      downloadUrlExpiresAt: inSeconds(DOWNLOAD_URL_TTL_SECONDS),
      downloadsRemaining: v.downloadsRemaining,
    });
  }),
];
