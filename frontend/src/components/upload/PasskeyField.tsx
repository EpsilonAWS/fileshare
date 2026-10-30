import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { PASSKEY_MIN_LENGTH } from "@shared/types";
import { cn } from "@/lib/utils";

export function PasskeyField({
  enabled,
  onEnabledChange,
  value,
  onChange,
}: {
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const tooShort = value.length > 0 && value.length < PASSKEY_MIN_LENGTH;

  useEffect(() => {
    if (enabled) inputRef.current?.focus();
  }, [enabled]);

  return (
    <div className={cn("rounded-2xl border p-4 transition-colors duration-300", enabled ? "border-sky-300/25 bg-sky-300/[0.04]" : "border-white/10 bg-white/[0.03]")}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <KeyRound className={cn("size-4 transition-colors", enabled ? "text-sky-200" : "text-white/40")} aria-hidden />
          <div>
            <p className="text-sm font-medium">Passkey lock</p>
            <p className="text-xs text-white/45">Part of the encryption key. Never sent to us.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Passkey lock"
          onClick={() => onEnabledChange(!enabled)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300",
            enabled ? "border-white bg-white" : "border-white/20 bg-white/10",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-[18px] rounded-full transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)]",
              enabled ? "translate-x-5 bg-[rgb(8,12,24)]" : "bg-white/80",
            )}
          />
        </button>
      </div>

      {/* Smooth height animation via grid rows. */}
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-400", enabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="pt-4">
            <div className="relative">
              <input
                ref={inputRef}
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={!enabled}
                placeholder="Choose a passkey"
                autoComplete="new-password"
                aria-label="Passkey"
                aria-describedby={hintId}
                aria-invalid={tooShort}
                className="w-full rounded-xl border border-white/12 bg-black/30 px-4 py-3 pr-11 text-sm placeholder:text-white/30 focus:border-sky-300/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                disabled={!enabled}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-white/45 hover:text-white"
                aria-label={visible ? "Hide passkey" : "Show passkey"}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p id={hintId} className={cn("mt-2 text-xs", tooShort ? "text-destructive" : "text-warning/90")}>
              {tooShort
                ? `At least ${PASSKEY_MIN_LENGTH} characters.`
                : "If it's forgotten, the file can't be recovered by anyone — including us."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
