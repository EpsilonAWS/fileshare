import { useRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { useSpotlight } from "@/lib/use-spotlight";

/** Frosted card whose edge and surface light up under the pointer. */
export function GlassCard({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  useSpotlight(ref);
  return <div ref={ref} className={cn("glass-card", className)} {...props} />;
}
