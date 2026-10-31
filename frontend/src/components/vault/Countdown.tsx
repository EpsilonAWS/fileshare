import { cn } from "@/lib/utils";

/** Big glowing timer. Turns warm and pulses in the last minute. */
export function Countdown({ ms }: { ms: number }) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts = h > 0 ? [pad(h), pad(m), pad(s)] : [pad(m), pad(s)];
  const urgent = total <= 60;

  return (
    <div className="text-center" role="timer" aria-label={`Self-destructs in ${describe(h, m, s)}`}>
      <p className="eyebrow">Self-destructs in</p>
      <p
        aria-hidden
        className={cn(
          "mt-2 font-mono text-4xl font-light tabular-nums tracking-tight transition-colors duration-700 sm:text-5xl",
          urgent
            ? "animate-pulse text-[#ffcf8f] [text-shadow:0_0_28px_rgba(255,180,100,0.6)]"
            : "text-sky-50 [text-shadow:0_0_28px_rgba(140,190,255,0.55)]",
        )}
      >
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1 opacity-40">:</span>}
            {p}
          </span>
        ))}
      </p>
    </div>
  );
}

function describe(h: number, m: number, s: number) {
  if (h > 0) return `${h} hours ${m} minutes`;
  if (m > 0) return `${m} minutes`;
  return `${s} seconds`;
}
