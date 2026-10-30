import { useId } from "react";

/** A ring that dissolves into particles. */
export function Logo({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f7dff" />
          <stop offset="1" stopColor="#dcefff" />
        </linearGradient>
      </defs>
      <path d="M16 4a12 12 0 1 1 -11.6 8.9" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
      <circle cx="5.6" cy="10" r="1.2" fill="#9cc9ff" opacity="0.8" />
      <circle cx="8.3" cy="6.8" r="0.95" fill="#9cc9ff" opacity="0.55" />
      <circle cx="11.9" cy="4.7" r="0.7" fill="#9cc9ff" opacity="0.3" />
      <circle cx="16" cy="16" r="3" fill={`url(#${id})`} />
    </svg>
  );
}
