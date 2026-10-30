/**
 * Flowing particle-stream background (canvas 2D).
 * The UI steers it through `field`:
 *   field.set("attract", point)  → streams bend toward a point (file dragged over page, uploading)
 *   field.set("swirl", point)    → particles orbit a point (encrypting)
 *   field.burst(point)           → one-off outward burst (upload done)
 *   field.intensity = 0..1       → overall brightness (vault page dims near expiry)
 */
export type FieldMode = "idle" | "attract" | "swirl";

export interface Point {
  x: number;
  y: number;
}

class FieldController {
  mode: FieldMode = "idle";
  target: Point | null = null;
  burstOrigin: Point | null = null;
  burstStart = Number.NEGATIVE_INFINITY;
  intensity = 1;
  /** Live pointer position + smoothed velocity (px/frame). Updated by trackPointer(). */
  pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false };

  set(mode: FieldMode, target: Point | null = null) {
    this.mode = mode;
    this.target = target;
  }

  burst(origin: Point) {
    this.burstOrigin = origin;
    this.burstStart = performance.now();
  }
}

export const field = new FieldController();

/** Viewport-space centre of an element (the canvas is fixed to the viewport). */
export function centerOf(el: Element | null): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Ice blues + white, with a few warm gold sparks (last entry).
const COLORS = ["156,201,255", "106,168,255", "207,230,255", "255,255,255", "70,120,255", "255,208,130"];
const GOLD = COLORS.length - 1;
const ALPHA_BUCKETS = 5;
const BG = "4,6,12";
const BURST_MS = 1100;
const POINTER_R = 170;

/**
 * Start feeding pointer position/velocity into `field.pointer`.
 * Mouse/pen only — touch has no hover, so it's ignored.
 */
export function trackPointer(): () => void {
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const p = field.pointer;
    const now = performance.now();
    if (p.active && now - lastT < 100) {
      const frames = Math.max(1, (now - lastT) / 16.67);
      p.vx = p.vx * 0.6 + ((e.clientX - lastX) / frames) * 0.4;
      p.vy = p.vy * 0.6 + ((e.clientY - lastY) / frames) * 0.4;
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    p.x = lastX = e.clientX;
    p.y = lastY = e.clientY;
    lastT = now;
    p.active = true;
  };
  const onLeave = () => {
    field.pointer.active = false;
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  return () => {
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("blur", onLeave);
    onLeave();
  };
}

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

export function startParticleField(canvas: HTMLCanvasElement, reducedMotion: boolean): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let w = 0;
  let h = 0;
  let fade = 0.085;
  let particles: Particle[] = [];
  let stars: Star[] = [];
  let raf = 0;
  let last = performance.now();

  const pickColor = () => (Math.random() < 0.06 ? GOLD : Math.floor(Math.random() * GOLD));

  // Centre of the bright swirling "core" (right of the headline on desktop, top on mobile).
  let cx = 0;
  let cy = 0;
  let coreR = 1;

  function gauss() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  function reset(p: Particle) {
    if (Math.random() < 0.55) {
      // Most particles are born around the core, so it glows the brightest.
      p.x = cx + gauss() * coreR * 1.3;
      p.y = cy + gauss() * coreR * 1.1;
    } else {
      // The rest drift across the page, denser toward the right.
      p.x = w * (1.1 * (1 - Math.random() ** 1.7) - 0.05);
      p.y = h * (Math.random() * 1.1 - 0.05);
    }
    p.px = p.x;
    p.py = p.y;
    p.vx = 0;
    p.vy = 0;
    p.age = 0;
    p.life = 140 + Math.random() * 320;
    p.color = pickColor();
    p.speed = 0.5 + Math.random() * 1.5;
  }

  function makeParticle(): Particle {
    const p = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, age: 0, life: 1, color: 0, speed: 1 };
    reset(p);
    p.age = Math.random() * p.life; // start mid-life so the first frame isn't empty
    return p;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.fillStyle = `rgb(${BG})`;
    ctx!.fillRect(0, 0, w, h);

    const mobile = w < 768;
    fade = mobile ? 0.09 : 0.055;
    cx = mobile ? w * 0.6 : w * 0.7;
    cy = mobile ? h * 0.22 : h * 0.47;
    coreR = Math.min(w, h) * (mobile ? 0.32 : 0.36);
    const count = Math.round(Math.min(mobile ? 600 : 1600, Math.max(300, (w * h) / 950)));
    while (particles.length < count) particles.push(makeParticle());
    particles.length = count;
    stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() < 0.9 ? 1 : 1.8,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function angle(x: number, y: number, t: number) {
    const s = 0.0018;
    return (
      -0.55 +
      1.15 * Math.sin(x * s + t * 0.00012) * Math.cos(y * s * 1.3 - t * 0.00009) +
      0.55 * Math.sin((x - y) * 0.0009 + t * 0.00006)
    );
  }

  function step(t: number, dt: number) {
    const c = ctx!;
    // Pointer velocity fades when the mouse stops moving.
    field.pointer.vx *= 0.9;
    field.pointer.vy *= 0.9;
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(${BG},${fade})`;
    c.fillRect(0, 0, w, h);

    c.globalCompositeOperation = "lighter";
    for (const s of stars) {
      const a = (0.08 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.0012 + s.phase))) * field.intensity;
      c.fillStyle = `rgba(200,222,255,${a})`;
      c.fillRect(s.x, s.y, s.r, s.r);
    }

    const paths = Array.from({ length: COLORS.length * ALPHA_BUCKETS }, () => new Path2D());
    const target = field.mode !== "idle" ? field.target : null;
    const burstAge = t - field.burstStart;
    const burst = burstAge >= 0 && burstAge < BURST_MS ? field.burstOrigin : null;

    for (const p of particles) {
      const a = angle(p.x, p.y, t);
      // Near the core, the flow bends into a slow outward spiral.
      const cdx = p.x - cx;
      const cdy = p.y - cy;
      const core = Math.exp(-(cdx * cdx + cdy * cdy) / (coreR * coreR));
      const spiral = Math.atan2(cdy, cdx) + Math.PI / 2 + 0.45 + 0.25 * Math.sin(t * 0.0003);
      let ax = (Math.cos(a) * (1 - core) + Math.cos(spiral) * core) * p.speed;
      let ay = (Math.sin(a) * (1 - core) + Math.sin(spiral) * core) * p.speed;

      if (target) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const d = Math.hypot(dx, dy) + 1;
        if (field.mode === "attract") {
          const f = Math.min(2.4, 300 / d) * 1.6;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        } else {
          const f = Math.min(3, 420 / d);
          ax += (-dy / d) * f * 1.9 + (dx / d) * f * 0.4;
          ay += (dx / d) * f * 1.9 + (dy / d) * f * 0.4;
        }
      }

      // Pointer: particles curl around the cursor and get dragged along its wake.
      const ptr = field.pointer;
      if (ptr.active) {
        const dx = p.x - ptr.x;
        const dy = p.y - ptr.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < POINTER_R * POINTER_R) {
          const d = Math.sqrt(d2) + 1;
          const k = (1 - d / POINTER_R) ** 2;
          ax += ((dx / d) * 2.2 + (-dy / d) * 2.6) * k + ptr.vx * k * 0.35;
          ay += ((dy / d) * 2.2 + (dx / d) * 2.6) * k + ptr.vy * k * 0.35;
        }
      }

      if (burst) {
        const dx = p.x - burst.x;
        const dy = p.y - burst.y;
        const d = Math.hypot(dx, dy) + 1;
        const k = (1 - burstAge / BURST_MS) * Math.min(7, 1100 / d);
        ax += (dx / d) * k;
        ay += (dy / d) * k;
      }

      p.vx += (ax - p.vx) * Math.min(1, 0.12 * dt);
      p.vy += (ay - p.vy) * Math.min(1, 0.12 * dt);
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;

      if (p.age > p.life || p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) {
        reset(p);
        continue;
      }

      const lifeAlpha = Math.sin((Math.PI * p.age) / p.life) * field.intensity;
      const bucket = Math.min(ALPHA_BUCKETS - 1, Math.floor(lifeAlpha * ALPHA_BUCKETS));
      const path = paths[p.color * ALPHA_BUCKETS + bucket];
      path.moveTo(p.px, p.py);
      path.lineTo(p.x, p.y);
    }

    // Two passes: a wide faint stroke for bloom, then the crisp core line.
    for (let i = 0; i < paths.length; i++) {
      const color = Math.floor(i / ALPHA_BUCKETS);
      const bucket = i % ALPHA_BUCKETS;
      const alpha = (bucket + 1) / ALPHA_BUCKETS;
      c.strokeStyle = `rgba(${COLORS[color]},${alpha * 0.07})`;
      c.lineWidth = 4;
      c.stroke(paths[i]);
      c.strokeStyle = `rgba(${COLORS[color]},${alpha * (color === GOLD ? 1 : 0.8)})`;
      c.lineWidth = color === 3 ? 0.8 : 1.2;
      c.stroke(paths[i]);
    }
  }

  function loop(now: number) {
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    step(now, dt);
    raf = requestAnimationFrame(loop);
  }

  function renderStill() {
    // Reduced motion: simulate a few seconds once and leave a still image.
    for (let i = 0; i < 240; i++) step(i * 16.67, 1);
  }

  function onVisibility() {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reducedMotion) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function onResize() {
    resize();
    if (reducedMotion) renderStill();
  }

  resize();
  window.addEventListener("resize", onResize);
  if (reducedMotion) {
    renderStill();
  } else {
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(loop);
  }

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
