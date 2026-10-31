import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Asks for the passkey. `onSubmit` resolves to an inline error message (wrong passkey,
 * rate limited) or null on success. Fatal errors are handled by the parent.
 */
export function PasskeyGate({ onSubmit }: { onSubmit: (passkey: string) => Promise<string | null> }) {
  const [passkey, setPasskey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passkey || busy) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit(passkey);
    setBusy(false);
    if (message) {
      setError(message);
      setShakeKey((k) => k + 1);
      setPasskey("");
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={submit} className="py-2">
      <div className="ring-pop mx-auto grid size-16 place-items-center rounded-full border border-sky-300/30 bg-sky-300/[0.07] text-sky-200 shadow-[0_0_50px_-12px_rgba(140,190,255,0.9)]">
        <Lock className="size-6" aria-hidden />
      </div>
      <h1 className="mt-5 text-center text-2xl font-light">This file is passkey locked</h1>
      <p className="mx-auto mt-2 max-w-xs text-center text-sm text-white/55">
        The sender should have shared the passkey with you separately.
      </p>

      <div key={shakeKey} className={cn("relative mt-7", shakeKey > 0 && "shake")}>
        <input
          ref={inputRef}
          type={visible ? "text" : "password"}
          value={passkey}
          onChange={(e) => setPasskey(e.target.value)}
          disabled={busy}
          placeholder="Enter passkey"
          autoComplete="off"
          aria-label="Passkey"
          aria-invalid={Boolean(error)}
          className={cn(
            "w-full rounded-xl border bg-black/35 px-4 py-3.5 pr-11 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-ring",
            error ? "border-destructive/60" : "border-white/12 focus:border-sky-300/50",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/45 hover:text-white"
          aria-label={visible ? "Hide passkey" : "Show passkey"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className="mt-2 min-h-5 text-xs text-red-200" aria-live="polite">
        {error}
      </p>

      <button type="submit" disabled={!passkey || busy} className="btn-primary group mt-3 w-full px-6 py-3.5 text-[0.95rem]">
        {busy ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Unlocking…
          </>
        ) : (
          <>
            Unlock
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
