import type { ReactNode } from "react";
import { Link } from "react-router";
import { CloudOff, Flame, Ghost, Hourglass, KeyRound, Link2Off, RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";

export type VaultProblem =
  | "NO_KEY"
  | "BAD_KEY"
  | "NOT_FOUND"
  | "EXPIRED"
  | "EXHAUSTED"
  | "LOCKED_OUT"
  | "UPLOAD_INCOMPLETE"
  | "GENERIC";

const COPY: Record<VaultProblem, { icon: ReactNode; title: string; text: string }> = {
  NO_KEY: {
    icon: <Link2Off className="size-6" />,
    title: "This link is incomplete",
    text: "The decryption key — the part after # — is missing. Ask the sender to copy the whole link again.",
  },
  BAD_KEY: {
    icon: <KeyRound className="size-6" />,
    title: "Can't decrypt this file",
    text: "The key in the link doesn't match the file. It may have been cut off or changed along the way.",
  },
  NOT_FOUND: {
    icon: <Ghost className="size-6" />,
    title: "Nothing here",
    text: "This link doesn't exist, or the file was already destroyed.",
  },
  EXPIRED: {
    icon: <Hourglass className="size-6" />,
    title: "This file has expired",
    text: "It self-destructed when its timer ran out. Ask the sender for a new link.",
  },
  EXHAUSTED: {
    icon: <Flame className="size-6" />,
    title: "This file is gone",
    text: "It reached its download limit and was destroyed.",
  },
  LOCKED_OUT: {
    icon: <ShieldAlert className="size-6" />,
    title: "This file is locked",
    text: "Too many wrong passkeys were entered, so the file was locked to protect it.",
  },
  UPLOAD_INCOMPLETE: {
    icon: <CloudOff className="size-6" />,
    title: "This upload never finished",
    text: "The sender's upload didn't complete, so there's nothing to download.",
  },
  GENERIC: {
    icon: <TriangleAlert className="size-6" />,
    title: "Something went wrong",
    text: "We couldn't open this file right now.",
  },
};

export function VaultMessage({
  problem,
  detail,
  onRetry,
}: {
  problem: VaultProblem;
  detail?: string;
  onRetry?: () => void;
}) {
  const c = COPY[problem];
  const final = problem === "EXPIRED" || problem === "EXHAUSTED" || problem === "NOT_FOUND";

  return (
    <div className="py-2 text-center" role="alert">
      <div className="ring-pop mx-auto grid size-16 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-sky-200">
        {c.icon}
      </div>
      <h1 className="mt-5 text-2xl font-light">{c.title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/55">{detail ?? c.text}</p>
      {final && <p className="eyebrow mt-6">Nothing was left behind</p>}
      <div className="mt-7 flex flex-col gap-2">
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-ghost w-full px-5 py-3 text-sm">
            <RotateCcw className="size-4" aria-hidden /> Try again
          </button>
        )}
        <Link to="/" className="btn-primary w-full px-5 py-3 text-sm">
          Send your own file
        </Link>
      </div>
    </div>
  );
}
