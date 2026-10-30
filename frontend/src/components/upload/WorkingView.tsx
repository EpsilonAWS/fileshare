import { Check, LoaderCircle } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

export type WorkStep = "packing" | "encrypting" | "uploading" | "finalizing";

const LABELS: Record<WorkStep, { title: string; doing: string }> = {
  packing: { title: "Bundle files", doing: "Bundling your files…" },
  encrypting: { title: "Encrypt on this device", doing: "Encrypting on your device…" },
  uploading: { title: "Upload encrypted data", doing: "Uploading encrypted data…" },
  finalizing: { title: "Seal the vault", doing: "Sealing the vault…" },
};

export function WorkingView({
  step,
  loaded,
  total,
  multiFile,
  onCancel,
}: {
  step: WorkStep;
  loaded: number;
  total: number;
  multiFile: boolean;
  onCancel: () => void;
}) {
  const steps: WorkStep[] = multiFile
    ? ["packing", "encrypting", "uploading", "finalizing"]
    : ["encrypting", "uploading", "finalizing"];
  const current = steps.indexOf(step);
  const uploadPct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  // Overall progress: each step is a slice; uploading fills its slice by bytes.
  const overall = ((current + (step === "uploading" ? uploadPct / 100 : 0.5)) / steps.length) * 100;

  return (
    <div className="py-2" aria-live="polite">
      <p className="eyebrow">In progress</p>
      <h2 className="mt-3 text-2xl font-light">{LABELS[step].doing}</h2>
      <p className="mt-1 text-sm text-white/50">
        {step === "uploading" && total > 0
          ? `${formatBytes(loaded)} of ${formatBytes(total)} · ${uploadPct}%`
          : "Keep this tab open."}
      </p>

      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="progress-fill h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, overall)}%` }}
        />
      </div>

      <ol className="mt-7 space-y-3.5">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className={cn("flex items-center gap-3 text-sm transition-colors duration-500", done ? "text-white/80" : active ? "text-white" : "text-white/35")}>
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border transition-all duration-500",
                  done ? "border-sky-300/60 bg-sky-300/15" : active ? "border-white/40" : "border-white/15",
                )}
              >
                {done ? (
                  <Check className="ring-pop size-3.5 text-sky-200" />
                ) : active ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <span className="size-1 rounded-full bg-current" />
                )}
              </span>
              {LABELS[s].title}
            </li>
          );
        })}
      </ol>

      {step === "uploading" && (
        <button type="button" onClick={onCancel} className="btn-ghost mt-8 w-full px-5 py-3 text-sm">
          Cancel upload
        </button>
      )}
    </div>
  );
}
