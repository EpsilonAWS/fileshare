import { useEffect, useRef, useState } from "react";
import { Check, Download, Files, Flame, LoaderCircle } from "lucide-react";
import type { EncryptedMetaPlain, UnlockRequest, VaultMetadata } from "@shared/types";
import { ApiRequestError, downloadFromStorage, requestDownload, unlockVault } from "@/lib/api-client";
import { decryptFile, type DerivedKeys } from "@/lib/crypto";
import { describeError } from "@/lib/errors";
import { centerOf, field } from "@/lib/particle-field";
import { saveBlob } from "@/lib/save-file";
import { cn, formatBytes } from "@/lib/utils";
import { Countdown } from "./Countdown";

export interface VaultSession {
  token: string;
  keys: DerivedKeys;
  /** Body to re-send to /unlock if the access token expires. */
  unlockBody: UnlockRequest;
  accessToken: string;
  vault: VaultMetadata;
  meta: EncryptedMetaPlain;
  /** serverTime − local time, so the countdown follows the server's clock. */
  offsetMs: number;
}

type Dl =
  | { state: "idle" }
  | { state: "requesting" }
  | { state: "downloading"; loaded: number; total: number }
  | { state: "decrypting" }
  | { state: "saved" }
  | { state: "error"; message: string };

export function FileReady({
  session,
  onGone,
}: {
  session: VaultSession;
  onGone: (reason: "EXPIRED" | "EXHAUSTED") => void;
}) {
  const [dl, setDl] = useState<Dl>({ state: "idle" });
  const [remaining, setRemaining] = useState(session.vault.downloadsRemaining);
  const [now, setNow] = useState(() => Date.now());
  const accessToken = useRef(session.accessToken);
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = dl.state === "requesting" || dl.state === "downloading" || dl.state === "decrypting";

  const msLeft = Date.parse(session.vault.expiresAt) - (now + session.offsetMs);

  // Tick the countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // Particles fade as the deadline approaches (last 3 minutes).
  useEffect(() => {
    field.intensity = 0.3 + 0.7 * Math.min(1, Math.max(0, msLeft) / 180_000);
  }, [msLeft]);
  useEffect(
    () => () => {
      field.intensity = 1;
    },
    [],
  );

  // Time's up (unless a download is mid-flight — the URL was already issued).
  useEffect(() => {
    if (msLeft <= 0 && !busy && dl.state !== "saved") onGone("EXPIRED");
  }, [msLeft, busy, dl.state, onGone]);

  async function download() {
    if (busy || remaining <= 0) return;
    const target = centerOf(rootRef.current);
    try {
      setDl({ state: "requesting" });
      field.set("attract", target);

      let res;
      try {
        res = await requestDownload(session.token, accessToken.current);
      } catch (err) {
        if (!(err instanceof ApiRequestError) || err.code !== "ACCESS_TOKEN_INVALID") throw err;
        // Access token timed out while the page sat open — unlock again silently and retry once.
        const fresh = await unlockVault(session.token, session.unlockBody);
        accessToken.current = fresh.accessToken;
        res = await requestDownload(session.token, accessToken.current);
      }
      setRemaining(res.downloadsRemaining);

      const encrypted = await downloadFromStorage(
        res.downloadUrl,
        (loaded, total) => setDl({ state: "downloading", loaded, total }),
        session.vault.sizeBytes,
      );

      setDl({ state: "decrypting" });
      field.set("swirl", target);
      const blob = await decryptFile(session.keys.fileKey, encrypted);
      saveBlob(blob, session.meta.name);

      field.set("idle");
      field.burst(target ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setDl({ state: "saved" });
    } catch (err) {
      field.set("idle");
      if (err instanceof ApiRequestError && (err.code === "EXPIRED" || err.code === "EXHAUSTED")) {
        onGone(err.code);
        return;
      }
      setDl({ state: "error", message: describeError(err) });
    }
  }

  const { meta } = session;
  const lastOne = remaining === 1;
  const destroyed = remaining <= 0 && dl.state === "saved";

  return (
    <div ref={rootRef} className="py-2">
      <p className="eyebrow text-center">Decrypted on this device</p>

      {/* File */}
      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-sky-200">
          {meta.files ? <Files className="size-5" /> : <span className="text-[0.65rem] font-semibold uppercase">{ext(meta.name)}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium" title={meta.name}>
            {meta.name}
          </span>
          <span className="block text-sm text-white/50">
            {formatBytes(meta.size)}
            {meta.files ? ` · ${meta.files.length} files` : ""}
          </span>
        </span>
      </div>
      {meta.files && (
        <ul className="mt-2 max-h-32 space-y-1 overflow-auto px-2 text-xs text-white/50">
          {meta.files.map((f, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Timer + downloads left (hidden once the file is destroyed) */}
      {!destroyed && (
      <>
      <div className="mt-7">
        <Countdown ms={msLeft} />
      </div>
      <div className="mt-5 flex items-center justify-center gap-1.5" aria-label={`${remaining} of ${session.vault.maxDownloads} downloads left`}>
        {Array.from({ length: session.vault.maxDownloads }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-700",
              session.vault.maxDownloads > 3 ? "w-4" : "w-8",
              i < remaining ? "bg-sky-200 shadow-[0_0_10px_rgba(140,190,255,0.8)]" : "bg-white/12",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-white/50">
        {remaining} of {session.vault.maxDownloads} download{session.vault.maxDownloads === 1 ? "" : "s"} left
      </p>
      </>
      )}

      {/* Action */}
      <div className="mt-7" aria-live="polite">
        {destroyed ? (
          <div className="swap-in rounded-2xl border border-[#ffcf8f]/25 bg-[#ffcf8f]/[0.06] p-4 text-center text-sm">
            <Flame className="mx-auto mb-2 size-5 text-[#ffcf8f]" aria-hidden />
            <p className="font-medium">Saved — and the file is now destroyed.</p>
            <p className="mt-1 text-xs text-white/55">That was the last download. This link no longer works.</p>
          </div>
        ) : (
          <>
            {lastOne && dl.state !== "saved" && (
              <p className="mb-3 text-center text-xs text-warning/90">
                This is the last download — the file is destroyed right after.
              </p>
            )}
            <button type="button" onClick={download} disabled={busy} className="btn-primary group w-full px-6 py-3.5 text-[0.95rem]">
              <DownloadLabel dl={dl} />
            </button>
            {dl.state === "downloading" && dl.total > 0 && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="progress-fill h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.round((dl.loaded / dl.total) * 100)}%` }}
                />
              </div>
            )}
            {dl.state === "error" && <p className="mt-3 text-center text-sm text-red-200">{dl.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function DownloadLabel({ dl }: { dl: Dl }) {
  switch (dl.state) {
    case "requesting":
      return (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Preparing…
        </>
      );
    case "downloading":
      return (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Downloading{dl.total > 0 ? ` ${Math.round((dl.loaded / dl.total) * 100)}%` : "…"}
        </>
      );
    case "decrypting":
      return (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Decrypting…
        </>
      );
    case "saved":
      return (
        <>
          <Check className="size-4" aria-hidden /> Saved · download again
        </>
      );
    default:
      return (
        <>
          <Download className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" aria-hidden /> Decrypt &amp; download
        </>
      );
  }
}

function ext(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 5 ? name.slice(dot + 1) : "file";
}
