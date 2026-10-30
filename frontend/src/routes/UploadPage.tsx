/**
 * Sender screen — TODO:
 *  1. Drop zone (single file or multiple → zip in browser), max 100 MB
 *  2. Policy: expiry (10m / 1h / 24h), download cap (1 / 3 / 10), optional passkey
 *  3. Encrypt (lib/crypto.ts) → createUpload → uploadToStorage (progress) → completeUpload
 *  4. Share view: full link incl. #key, copy button, expiry summary
 */
import { DOWNLOAD_LIMIT_OPTIONS, EXPIRY_OPTIONS, MAX_UPLOAD_BYTES } from "@shared/types";
import { formatBytes } from "@/lib/utils";

export function UploadPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Send a file</h1>
      <p className="text-muted-foreground">
        Encrypted in your browser. Up to {formatBytes(MAX_UPLOAD_BYTES)}. Expires after{" "}
        {EXPIRY_OPTIONS.join(" / ")} or {DOWNLOAD_LIMIT_OPTIONS.join(" / ")} downloads.
      </p>
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        Upload screen goes here
      </div>
    </section>
  );
}
