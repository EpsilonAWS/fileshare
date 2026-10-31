import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CircleAlert, ShieldCheck } from "lucide-react";
import {
  MAX_UPLOAD_BYTES,
  PASSKEY_MIN_LENGTH,
  type DownloadLimit,
  type ExpiryOption,
} from "@shared/types";
import { completeUpload, createUpload, uploadToStorage } from "@/lib/api-client";
import { bundleFiles } from "@/lib/bundle";
import { buildShareLink, prepareUpload } from "@/lib/crypto";
import { describeError } from "@/lib/errors";
import { centerOf, field } from "@/lib/particle-field";
import { useSpotlight } from "@/lib/use-spotlight";
import { DropZone } from "./DropZone";
import { PasskeyField } from "./PasskeyField";
import { Segmented } from "./Segmented";
import { ShareResult } from "./ShareResult";
import { WorkingView, type WorkStep } from "./WorkingView";

const EXPIRY_CHOICES = [
  { value: "10m", label: "10 min" },
  { value: "1h", label: "1 hr" },
  { value: "24h", label: "24 hr" },
] as const satisfies readonly { value: ExpiryOption; label: string }[];

const DOWNLOAD_CHOICES = [
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 10, label: "10" },
] as const satisfies readonly { value: DownloadLimit; label: string }[];

type Phase =
  | { kind: "idle" }
  | { kind: "working"; step: WorkStep; loaded: number; total: number }
  | { kind: "done"; link: string; expiresAt: string; serverTime: string; maxDownloads: number; hasPasskey: boolean };

export function UploadCard() {
  const [files, setFiles] = useState<File[]>([]);
  const [expiry, setExpiry] = useState<ExpiryOption>("1h");
  const [maxDownloads, setMaxDownloads] = useState<DownloadLimit>(1);
  const [passkeyOn, setPasskeyOn] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useSpotlight(cardRef);

  const total = files.reduce((n, f) => n + f.size, 0);
  const canSend =
    files.length > 0 && total <= MAX_UPLOAD_BYTES && (!passkeyOn || passkey.length >= PASSKEY_MIN_LENGTH);

  const addFiles = useCallback((incoming: File[]) => {
    setError(null);
    setFiles((prev) => {
      const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))];
    });
  }, []);

  // Drop files anywhere on the page; particles stream toward the card while dragging.
  useEffect(() => {
    if (phase.kind !== "idle") return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const end = () => {
      depth = 0;
      setDragging(false);
      field.set("idle");
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
      field.set("attract", centerOf(cardRef.current));
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) end();
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      end();
      if (e.dataTransfer?.files.length) addFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      field.set("idle");
    };
  }, [phase.kind, addFiles]);

  async function send() {
    if (!canSend) return;
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    const target = centerOf(cardRef.current);
    const multi = files.length > 1;

    try {
      setPhase({ kind: "working", step: multi ? "packing" : "encrypting", loaded: 0, total: 0 });
      field.set("swirl", target);
      const { blob, meta } = await bundleFiles(files);

      setPhase({ kind: "working", step: "encrypting", loaded: 0, total: 0 });
      const prepared = await prepareUpload(blob, meta, passkeyOn ? passkey : undefined);

      const created = await createUpload({
        sizeBytes: prepared.ciphertext.size,
        expiry,
        maxDownloads,
        encryptedMeta: prepared.encryptedMeta,
        passkeyProtection: prepared.passkeyProtection,
      });

      field.set("attract", target);
      setPhase({ kind: "working", step: "uploading", loaded: 0, total: prepared.ciphertext.size });
      await uploadToStorage(
        created,
        prepared.ciphertext,
        (loaded, t) => setPhase({ kind: "working", step: "uploading", loaded, total: t }),
        ac.signal,
      );

      setPhase({ kind: "working", step: "finalizing", loaded: 0, total: 0 });
      const done = await completeUpload(created.uploadId);

      field.set("idle");
      field.burst(target ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setPhase({
        kind: "done",
        link: buildShareLink(window.location.origin, done.shareToken, prepared.linkSecret),
        expiresAt: done.expiresAt,
        serverTime: done.serverTime,
        maxDownloads: done.maxDownloads,
        hasPasskey: passkeyOn,
      });
      setPasskey("");
    } catch (err) {
      field.set("idle");
      setPhase({ kind: "idle" });
      if (!ac.signal.aborted) setError(describeError(err));
    } finally {
      abortRef.current = null;
    }
  }

  function reset() {
    setFiles([]);
    setPasskey("");
    setPasskeyOn(false);
    setError(null);
    setPhase({ kind: "idle" });
  }

  return (
    <div ref={cardRef} className="glass-card rounded-[28px] p-5 sm:p-7">
      {phase.kind === "idle" && (
        <form
          key="idle"
          className="swap-in space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex items-center justify-between">
            <p className="eyebrow">New transfer</p>
            <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
              <ShieldCheck className="size-3.5 text-sky-200" aria-hidden /> Encrypted on this device
            </span>
          </div>

          <DropZone
            files={files}
            active={dragging}
            onAdd={addFiles}
            onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Segmented legend="Expires after" options={EXPIRY_CHOICES} value={expiry} onChange={setExpiry} />
            <Segmented legend="Max downloads" options={DOWNLOAD_CHOICES} value={maxDownloads} onChange={setMaxDownloads} />
          </div>

          <PasskeyField enabled={passkeyOn} onEnabledChange={setPasskeyOn} value={passkey} onChange={setPasskey} />

          {error && (
            <p role="alert" className="swap-in flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <button type="submit" disabled={!canSend} className="btn-primary group w-full px-6 py-3.5 text-[0.95rem]">
            Encrypt &amp; get link
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </button>
        </form>
      )}

      {phase.kind === "working" && (
        <div key="working" className="swap-in">
          <WorkingView
            step={phase.step}
            loaded={phase.loaded}
            total={phase.total}
            multiFile={files.length > 1}
            onCancel={() => abortRef.current?.abort()}
          />
        </div>
      )}

      {phase.kind === "done" && (
        <div key="done" className="swap-in">
          <ShareResult
            link={phase.link}
            expiresAt={phase.expiresAt}
            serverTime={phase.serverTime}
            maxDownloads={phase.maxDownloads}
            hasPasskey={phase.hasPasskey}
            onReset={reset}
          />
        </div>
      )}
    </div>
  );
}
