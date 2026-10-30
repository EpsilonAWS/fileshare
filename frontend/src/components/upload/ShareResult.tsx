import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, Lock, LockOpen, RotateCcw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShareResult({
  link,
  expiresAt,
  serverTime,
  maxDownloads,
  hasPasskey,
  onReset,
}: {
  link: string;
  expiresAt: string;
  serverTime: string;
  maxDownloads: number;
  hasPasskey: boolean;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  }

  const lifetime = new Date(expiresAt).getTime() - new Date(serverTime).getTime();

  return (
    <div className="py-2">
      <div className="ring-pop mx-auto grid size-16 place-items-center rounded-full border border-sky-300/40 bg-sky-300/10 shadow-[0_0_60px_-10px_rgba(140,190,255,0.9)]">
        <Check className="size-7 text-sky-100" aria-hidden />
      </div>
      <h2 className="mt-5 text-center text-2xl font-light">Your link is ready</h2>
      <p className="mt-1 text-center text-sm text-white/50">Encrypted, uploaded, and counting down.</p>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-white/12 bg-black/30 p-1.5 pl-4">
        <input
          ref={inputRef}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Share link"
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-sky-100/90 focus:outline-none"
        />
        <button type="button" onClick={copy} className={cn("btn-primary shrink-0 px-4 py-2.5 text-sm", copied && "bg-sky-200")}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <ul className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-white/70">
        <Chip icon={<Timer className="size-3.5" />}>Expires in {formatDuration(lifetime)}</Chip>
        <Chip icon={<Download className="size-3.5" />}>
          {maxDownloads} download{maxDownloads === 1 ? "" : "s"}
        </Chip>
        <Chip icon={hasPasskey ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}>
          {hasPasskey ? "Passkey locked" : "No passkey"}
        </Chip>
      </ul>

      <div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-white/55">
        <p>
          The part after <span className="font-mono text-sky-200">#</span> is the decryption key. Copy the whole link — if it gets
          cut off, the file can't be opened.
        </p>
        {hasPasskey ? (
          <p className="text-warning/90">Send the passkey separately. It isn't in the link.</p>
        ) : (
          <p>Anyone with this link can open the file until it expires.</p>
        )}
      </div>

      <button type="button" onClick={onReset} className="btn-ghost mt-6 w-full px-5 py-3 text-sm">
        <RotateCcw className="size-4" aria-hidden /> Send another file
      </button>
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
      <span className="text-sky-200">{icon}</span>
      {children}
    </li>
  );
}

function formatDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
