/**
 * The ONLY place the frontend talks to the backend.
 * Screens call these functions; they never call fetch/axios directly.
 * In dev, MSW intercepts these requests when VITE_API_MOCKING=enabled.
 */
import axios from "axios";
import {
  API,
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

/** Thrown for every non-2xx API response. Switch on `code` in the UI. */
export class ApiRequestError extends Error {
  readonly code: ErrorCode | "NETWORK_ERROR";
  readonly status: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode | "NETWORK_ERROR", status: number, message: string, details?: ErrorDetails) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", 0, "Could not reach the server");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      body?.error.code ?? "INTERNAL",
      res.status,
      body?.error.message ?? res.statusText,
      body?.error.details,
    );
  }
  return (await res.json()) as T;
}

// ─── Sender ────────────────────────────────────────────────────────────────

export function createUpload(body: CreateUploadRequest) {
  return request<CreateUploadResponse>(API.createUpload(), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function completeUpload(uploadId: string) {
  return request<CompleteUploadResponse>(API.completeUpload(uploadId), { method: "POST" });
}

/**
 * PUT the encrypted blob straight to R2 using the presigned URL.
 * Uses axios (XHR) because fetch cannot report upload progress.
 */
export async function uploadToStorage(
  upload: Pick<CreateUploadResponse, "uploadUrl" | "uploadHeaders">,
  blob: Blob,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await axios.put(upload.uploadUrl, blob, {
      headers: upload.uploadHeaders,
      signal,
      onUploadProgress: (e) => onProgress(e.loaded, e.total ?? blob.size),
    });
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw new ApiRequestError("STORAGE_ERROR", 502, "Upload to storage failed");
  }
}

// ─── Receiver ──────────────────────────────────────────────────────────────

export function getVaultStatus(token: string) {
  return request<VaultStatusResponse>(API.vaultStatus(token));
}

export function unlockVault(token: string, body: UnlockRequest) {
  return request<UnlockResponse>(API.unlock(token), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function requestDownload(token: string, accessToken: string) {
  return request<DownloadResponse>(API.download(token), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
