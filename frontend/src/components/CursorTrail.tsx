import { useEffect, useRef } from "react";

/**
 * Comet tail + trailing ring that follow the mouse.
 *  - A tapered glowing ribbon draws the last ~300 ms of pointer movement.
 *  - Small sparks shed off the head when moving fast.
 *  - A ring eases after the cursor and grows over buttons/links.
 * Mouse/pen only, off for "reduce motion". The native cursor stays visible.
 */
const TRAIL_MS = 320;
const SPARK_MS = 700;
const INTERACTIVE = "a, button, label, input, select, textarea, [role='switch']";

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: string;
  size: number;
}

const SPARK_COLORS = ["210,232,255", "150,198,255", "255,255,255", "255,214,150"];

export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !fine || reduced) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let visible = false;
    let hovering = false;
    const trail: TrailPoint[] = [];
    const sparks: Spark[] = [];
    const pointer = { x: -100, y: -100 };
    const ring = { x: -100, y: -100, r: 14 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function start() {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const now = performance.now();
      // Coalesced events give a smooth curve even when the mouse moves fast.
      const events = e.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e]) trail.push({ x: ev.clientX, y: ev.clientY, t: now });

      const prev = pointer.x < 0 ? { x: e.clientX, y: e.clientY } : { ...pointer };
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!visible) {
        ring.x = pointer.x;
        ring.y = pointer.y;
        visible = true;
      }

      const speed = Math.hypot(pointer.x - prev.x, pointer.y - prev.y);
      const count = Math.min(4, Math.floor(speed / 9));
      for (let i = 0; i < count; i++) {
        const angle = Math.atan2(prev.y - pointer.y, prev.x - pointer.x) + (Math.random() - 0.5) * 1.6;
        const v = 0.4 + Math.random() * 1.6;
        sparks.push({
          x: pointer.x,
          y: pointer.y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          born: now,
          color: SPARK_COLORS[Math.random() < 0.12 ? 3 : Math.floor(Math.random() * 3)],
          size: 0.8 + Math.random() * 1.4,
        });
      }
      if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
      start();
    }

    function onOver(e: PointerEvent) {
      hovering = e.target instanceof Element && e.target.closest(INTERACTIVE) !== null;
      start();
    }

    function onLeave() {
      visible = false;
      trail.length = 0;
      start();
    }

    function frame(now: number) {
      const c = ctx!;
      c.clearRect(0, 0, w, h);
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      c.lineJoin = "round";

      // Comet ribbon: oldest → newest, getting wider and brighter toward the head.
      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1];
        const b = trail[i];
        const life = 1 - (now - b.t) / TRAIL_MS; // 1 at head, 0 at tail
        const pos = i / trail.length;
        const k = Math.max(0, life * pos);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.strokeStyle = `rgba(110,165,255,${k * 0.18})`;
        c.lineWidth = 2 + k * 12;
        c.stroke();
        c.strokeStyle = `rgba(225,240,255,${k * 0.9})`;
        c.lineWidth = 0.6 + k * 2.6;
        c.stroke();
      }

      // Sparks drift back along the path and fade.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = (now - s.born) / SPARK_MS;
        if (age >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.95;
        s.vy = s.vy * 0.95 + 0.02;
        const alpha = (1 - age) ** 1.5;
        c.fillStyle = `rgba(${s.color},${alpha})`;
        c.beginPath();
        c.arc(s.x, s.y, s.size * (1 - age * 0.5), 0, Math.PI * 2);
        c.fill();
      }

      // Ring eases toward the pointer (spring-ish lag) and grows over interactive elements.
      ring.x += (pointer.x - ring.x) * 0.16;
      ring.y += (pointer.y - ring.y) * 0.16;
      ring.r += ((hovering ? 24 : 14) - ring.r) * 0.18;
      if (visible) {
        c.globalCompositeOperation = "source-over";
        c.beginPath();
        c.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        c.strokeStyle = hovering ? "rgba(190,222,255,0.75)" : "rgba(190,222,255,0.45)";
        c.lineWidth = 1;
        c.stroke();
        if (hovering) {
          c.fillStyle = "rgba(150,200,255,0.08)";
          c.fill();
        }
      }

      const settled =
        trail.length === 0 &&
        sparks.length === 0 &&
        Math.abs(pointer.x - ring.x) < 0.3 &&
        Math.abs(pointer.y - ring.y) < 0.3 &&
        Math.abs((hovering ? 24 : 14) - ring.r) < 0.3;
      if (settled) {
        // Draw the resting ring once, then stop the loop until the pointer moves again.
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full" />;
}
