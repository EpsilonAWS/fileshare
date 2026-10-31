/**
 * End-to-end encryption, all in the browser (Web Crypto API).
 * The scheme is documented at the top of shared/types.ts — keep them in sync.
 *
 *   linkSecret = 32 random bytes                       → lives in the link's #fragment
 *   passkeyKey = PBKDF2-SHA256(passkey, salt, iters)   → only if a passkey is set
 *   ikm        = linkSecret || passkeyKey
 *   fileKey    = HKDF-SHA256(ikm, "fileshare/enc")     → AES-256-GCM
 *   authToken  = HKDF-SHA256(ikm, "fileshare/auth")    → sent to server instead of passkey
 *
 * Ciphertext format (file and meta): iv (12 bytes) || AES-GCM ciphertext+tag.
 * Additional authenticated data binds each blob to its role, so a file
 * ciphertext can't be swapped in as metadata or vice versa.
 */
import {
  LINK_SECRET_BYTES,
  PBKDF2_ITERATIONS,
  type EncryptedMetaPlain,
  type KdfParams,
} from "@shared/types";

type Bytes = Uint8Array<ArrayBuffer>;

const IV_BYTES = 12;
const SALT_BYTES = 16;
const enc = new TextEncoder();
const dec = new TextDecoder();

const INFO_ENC = enc.encode("fileshare/enc");
const INFO_AUTH = enc.encode("fileshare/auth");
const AAD_FILE = enc.encode("fileshare/file/v1");
const AAD_META = enc.encode("fileshare/meta/v1");

/** Thrown when decryption fails: wrong key, wrong passkey, or tampered data. */
export class DecryptionError extends Error {
  constructor(message = "Could not decrypt. The link or passkey may be wrong.") {
    super(message);
    this.name = "DecryptionError";
  }
}

// ─── base64url ─────────────────────────────────────────────────────────────

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Bytes {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ─── Key derivation ────────────────────────────────────────────────────────

export interface DerivedKeys {
  fileKey: CryptoKey;
  /** base64url. Only meaningful when a passkey is set. */
  authToken: string;
}

export function generateLinkSecret(): Bytes {
  return randomBytes(LINK_SECRET_BYTES);
}

export function newKdfParams(): KdfParams {
  return {
    algorithm: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64Url(randomBytes(SALT_BYTES)),
  };
}

async function pbkdf2(passkey: string, kdf: KdfParams): Promise<Bytes> {
  if (kdf.algorithm !== "PBKDF2-SHA256") throw new Error(`Unsupported KDF: ${kdf.algorithm}`);
  const base = await crypto.subtle.importKey("raw", enc.encode(passkey.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(kdf.salt), iterations: kdf.iterations },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Derive the file key (and auth token) from the link secret and optional passkey.
 * With a passkey this takes ~0.3–1s (PBKDF2) — show a spinner.
 */
export async function deriveKeys(
  linkSecret: Uint8Array,
  passkey?: { passkey: string; kdf: KdfParams },
): Promise<DerivedKeys> {
  const ikm = passkey ? concat(linkSecret, await pbkdf2(passkey.passkey, passkey.kdf)) : concat(linkSecret);
  const hkdfKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey", "deriveBits"]);
  const salt = new Uint8Array(0);

  const fileKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: INFO_ENC },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: INFO_AUTH },
    hkdfKey,
    256,
  );
  return { fileKey, authToken: toBase64Url(new Uint8Array(authBits)) };
}

// ─── Encrypt / decrypt ─────────────────────────────────────────────────────

async function seal(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plaintext);
  return concat(iv, new Uint8Array(ct));
}

async function open(key: CryptoKey, sealed: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<Bytes> {
  if (sealed.length < IV_BYTES + 16) throw new DecryptionError("Data is too short to be valid");
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.subarray(0, IV_BYTES), additionalData: aad },
      key,
      sealed.subarray(IV_BYTES),
    );
    return new Uint8Array(pt);
  } catch {
    throw new DecryptionError();
  }
}

export async function encryptFile(key: CryptoKey, file: Blob): Promise<Blob> {
  const sealed = await seal(key, new Uint8Array(await file.arrayBuffer()), AAD_FILE);
  return new Blob([sealed], { type: "application/octet-stream" });
}

export async function decryptFile(key: CryptoKey, encrypted: Blob, contentType = "application/octet-stream"): Promise<Blob> {
  const pt = await open(key, new Uint8Array(await encrypted.arrayBuffer()), AAD_FILE);
  return new Blob([pt], { type: contentType });
}

export async function encryptMeta(key: CryptoKey, meta: EncryptedMetaPlain): Promise<string> {
  return toBase64Url(await seal(key, enc.encode(JSON.stringify(meta)), AAD_META));
}

export async function decryptMeta(key: CryptoKey, encryptedMeta: string): Promise<EncryptedMetaPlain> {
  const pt = await open(key, fromBase64Url(encryptedMeta), AAD_META);
  return JSON.parse(dec.decode(pt)) as EncryptedMetaPlain;
}

// ─── Share link helpers ────────────────────────────────────────────────────

export function buildShareLink(origin: string, shareToken: string, linkSecret: Uint8Array): string {
  return `${origin}/vault/${encodeURIComponent(shareToken)}#${toBase64Url(linkSecret)}`;
}

/**
 * Read the link secret from location.hash, then remove it from the address bar
 * and browser history. Returns null if missing or malformed.
 * Call ONCE on vault page load and keep the result in memory (state/ref).
 */
export function takeLinkSecretFromHash(): Bytes | null {
  const raw = window.location.hash.slice(1);
  if (raw) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  try {
    const secret = fromBase64Url(raw);
    return secret.length === LINK_SECRET_BYTES ? secret : null;
  } catch {
    return null;
  }
}

// ─── High-level helpers used by the screens ────────────────────────────────

export interface PreparedUpload {
  linkSecret: Bytes;
  ciphertext: Blob;
  encryptedMeta: string;
  /** Pass straight into CreateUploadRequest.passkeyProtection. */
  passkeyProtection?: { authToken: string; kdf: KdfParams };
}

/** Sender: everything needed for createUpload + uploadToStorage. */
export async function prepareUpload(
  file: Blob,
  meta: EncryptedMetaPlain,
  passkey?: string,
): Promise<PreparedUpload> {
  const linkSecret = generateLinkSecret();
  const kdf = passkey ? newKdfParams() : undefined;
  const { fileKey, authToken } = await deriveKeys(linkSecret, passkey && kdf ? { passkey, kdf } : undefined);
  const [ciphertext, encryptedMeta] = await Promise.all([encryptFile(fileKey, file), encryptMeta(fileKey, meta)]);
  return {
    linkSecret,
    ciphertext,
    encryptedMeta,
    passkeyProtection: kdf ? { authToken, kdf } : undefined,
  };
}
