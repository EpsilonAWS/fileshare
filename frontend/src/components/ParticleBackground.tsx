import { useEffect, useRef } from "react";
import { field, startParticleField, trackPointer } from "@/lib/particle-field";

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stopField = startParticleField(canvasRef.current!, reduced);
    if (reduced) return stopField;

    const stopPointer = trackPointer();

    // A soft light that drifts after the pointer.
    const glow = glowRef.current!;
    const pos = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.45 };
    let raf = 0;
    const follow = () => {
      const p = field.pointer;
      if (p.active) {
        pos.x += (p.x - pos.x) * 0.08;
        pos.y += (p.y - pos.y) * 0.08;
      }
      glow.style.transform = `translate3d(${pos.x - 320}px, ${pos.y - 320}px, 0)`;
      glow.style.opacity = p.active ? "1" : "0";
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);

    return () => {
      cancelAnimationFrame(raf);
      stopPointer();
      stopField();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {/* Soft nebula glow behind the particle core. */}
      <div className="absolute inset-0 mix-blend-screen bg-[radial-gradient(ellipse_45%_55%_at_70%_47%,rgba(70,120,255,0.22),transparent_70%)] max-md:bg-[radial-gradient(ellipse_70%_35%_at_60%_22%,rgba(70,120,255,0.22),transparent_70%)]" />
      {/* Darken the left side so the headline stays readable, and vignette the edges. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,6,12,0.88)_0%,rgba(4,6,12,0.45)_42%,transparent_70%)] max-lg:bg-[linear-gradient(180deg,rgba(4,6,12,0.75)_0%,rgba(4,6,12,0.35)_50%,rgba(4,6,12,0.75)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_65%_45%,transparent_35%,rgba(4,6,12,0.7)_100%)]" />
      {/* Pointer light (above the vignette so it lights up dark areas too). */}
      <div
        ref={glowRef}
        className="absolute top-0 left-0 size-[640px] rounded-full opacity-0 mix-blend-screen transition-opacity duration-700 will-change-transform bg-[radial-gradient(circle,rgba(90,140,255,0.16)_0%,rgba(90,140,255,0.06)_35%,transparent_65%)]"
      />
    </div>
  );
}
