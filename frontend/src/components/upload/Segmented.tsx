import { useId } from "react";
import { cn } from "@/lib/utils";

interface Option<T> {
  value: T;
  label: string;
}

/** Pill-shaped radio group with a sliding highlight. */
export function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <fieldset>
      <legend className="eyebrow mb-2.5">{legend}</legend>
      <div className="relative grid grid-flow-col auto-cols-fr rounded-full border border-white/10 bg-white/[0.03] p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-full bg-white shadow-[0_0_28px_-6px_rgba(150,200,255,0.8)] transition-transform duration-500 ease-[cubic-bezier(0.3,1.3,0.4,1)]"
          style={{
            width: `calc((100% - 0.5rem) / ${options.length})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={cn(
                "relative z-10 cursor-pointer whitespace-nowrap rounded-full px-1 py-2 text-center text-sm transition-colors duration-300",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "text-[rgb(8,12,24)] font-medium" : "text-white/60 hover:text-white",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                checked={checked}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
