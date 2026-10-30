import { useRef } from "react";
import { FileUp, Plus, X } from "lucide-react";
import { MAX_UPLOAD_BYTES } from "@shared/types";
import { cn, formatBytes } from "@/lib/utils";

const MAX_LISTED = 4;

export function DropZone({
  files,
  active,
  onAdd,
  onRemove,
}: {
  files: File[];
  /** A file is being dragged over the page. */
  active: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);
  const tooBig = total > MAX_UPLOAD_BYTES;

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        if (e.target.files?.length) onAdd(Array.from(e.target.files));
        e.target.value = "";
      }}
    />
  );

  if (files.length === 0) {
    return (
      <>
        {input}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-9 text-center transition-all duration-300",
            active
              ? "drop-active scale-[1.015] border-sky-300/70 bg-sky-300/[0.07]"
              : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]",
          )}
        >
          <span
            className={cn(
              "grid size-14 place-items-center rounded-full border border-white/15 bg-white/[0.04] transition-transform duration-500",
              active ? "-translate-y-1 scale-110" : "group-hover:-translate-y-0.5",
            )}
          >
            <FileUp className="size-6 text-sky-200" aria-hidden />
          </span>
          <span className="text-base font-medium">{active ? "Release to add" : "Drop files anywhere"}</span>
          <span className="text-sm text-white/50">
            or <span className="text-white underline decoration-white/30 underline-offset-4">browse</span> · up to{" "}
            {formatBytes(MAX_UPLOAD_BYTES)}
          </span>
        </button>
      </>
    );
  }

  const shown = files.slice(0, MAX_LISTED);
  const hidden = files.length - shown.length;

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-all duration-300",
        active ? "drop-active border-sky-300/70 bg-sky-300/[0.07]" : "border-white/10 bg-white/[0.03]",
      )}
    >
      {input}
      <ul className="space-y-1">
        {shown.map((f, i) => (
          <li key={`${f.name}-${f.size}-${f.lastModified}`} className="swap-in flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[0.6rem] font-semibold uppercase tracking-wide text-sky-200">
              {extension(f.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{f.name}</span>
              <span className="block text-xs text-white/45">{formatBytes(f.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="grid size-8 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
              aria-label={`Remove ${f.name}`}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="px-2 pt-1 text-xs text-white/45">+ {hidden} more</p>}

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 px-2 pt-3 text-xs">
        <span className={tooBig ? "text-destructive" : "text-white/50"}>
          {files.length > 1 ? `${files.length} files · ` : ""}
          {formatBytes(total)}
          {tooBig ? ` — over the ${formatBytes(MAX_UPLOAD_BYTES)} limit` : files.length > 1 ? " · sent as one .zip" : ""}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <Plus className="size-3.5" aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && name.length - dot <= 5 ? name.slice(dot + 1) : "file";
}
