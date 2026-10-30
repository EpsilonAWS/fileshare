/**
 * Fake backend state for MSW, persisted in the browser so a link created in
 * one tab can be opened in another (sender → receiver flow).
 *   - vault records → localStorage
 *   - encrypted blobs → IndexedDB (too big for localStorage)
 * Dev only. Clear with: localStorage.removeItem("mock-vaults") in the console.
 */
import type { DownloadLimit, ExpiryOption, KdfParams } from "@shared/types";

export interface MockVault {
  uploadId: string;
  shareToken: string;
  sizeBytes: number;
  expiry: ExpiryOption;
  maxDownloads: DownloadLimit;
  downloadsRemaining: number;
  encryptedMeta: string;
  authToken?: string;
  kdf?: KdfParams;
  failedAttempts: number;
  completedAt?: string;
  expiresAt?: string;
}

const KEY = "mock-vaults";

function readAll(): Record<string, MockVault> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, MockVault>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore quota errors in dev */
  }
}

export const vaults = {
  get: (shareToken: string) => readAll()[shareToken],
  byUploadId: (uploadId: string) => Object.values(readAll()).find((v) => v.uploadId === uploadId),
  put: (v: MockVault) => {
    const all = readAll();
    all[v.shareToken] = v;
    writeAll(all);
  },
};

// ─── Blob storage (IndexedDB) ──────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("mock-storage", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("blobs");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putBlob(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("blobs").objectStore("blobs").get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}
