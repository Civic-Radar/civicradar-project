'use client';

import { useEffect, useRef } from 'react';

// Decorative art behind the landing page hero: a line drawing of a town hall
// (columns like the Civic Radar logo) between two trees whose canopies are made
// of the leaves from Marcos's falling-leaves concept, with rooftops behind.
// The lines draw in on load, the canopies sway, and leaves drift down.
// Reduced motion shows the finished picture, standing still.
// variant "hero" sits to the right of the landing page text; "panel" is
// centered in its box (the sign-in and sign-up pages).

// Leaf colors from the falling-leaves concept.
const LEAF_LIGHT = '#4fa65c';
const LEAF_DARK = '#3a8f48';
const LEAF_VEIN = '#1f5a33';

type Segment = { x: number; y: number; x2: number; y2: number; w: number; t0: number; dur: number };
type Point = { x: number; y: number; t: number };
type CanopyLeaf = { tx: number; ty: number; rot: number; s: number; phase: number; ready: number };
type FallingLeaf = { t0: number; x: number; y: number; rot: number; s: number; ph: number; drift: number };

// Small seeded random so the picture is the same on every visit.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, alpha: number) {
  if (alpha <= 0 || s <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.bezierCurveTo(20, -20, 19, 14, 0, 32);
  ctx.bezierCurveTo(-19, 14, -20, -20, 0, -32);
  ctx.fillStyle = LEAF_LIGHT;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.bezierCurveTo(20, -20, 19, 14, 0, 32);
  ctx.bezierCurveTo(3, 10, 3, -12, 0, -32);
  ctx.fillStyle = LEAF_DARK;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.bezierCurveTo(3, -10, 3, 10, 0, 32);
  ctx.strokeStyle = LEAF_VEIN;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// A branching tree as line segments that grow in over time, plus twig points for leaves.
function buildTree(r: () => number, x0: number, y0: number, len: number, depth: number, delay0: number, step: number) {
  const segs: Segment[] = [];
  const twigs: Point[] = [];
  const grow = (x: number, y: number, ang: number, l: number, d: number, delay: number) => {
    const x2 = x + Math.cos(ang) * l;
    const y2 = y + Math.sin(ang) * l;
    segs.push({ x, y, x2, y2, w: Math.max(1, d * 1.25 + 0.4), t0: delay, dur: step });
    if (d <= 2) twigs.push({ x: x2, y: y2, t: delay + step });
    if (d === 0) return;
    const n = d >= depth - 1 ? 2 : r() < 0.55 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.5 + r() * 0.2) + (r() - 0.5) * 0.25;
      grow(x2, y2, ang + spread, l * (0.7 + r() * 0.08), d - 1, delay + step);
    }
  };
  grow(x0, y0, -Math.PI / 2 + (r() - 0.5) * 0.08, len, depth, delay0);
  return { segs, twigs };
}

type Variant = 'hero' | 'panel';

function buildScene(W: number, H: number, variant: Variant = 'hero') {
  const narrow = W < 900;
  const k =
    variant === 'panel'
      ? Math.min(H / 520, W / 640)
      : narrow
        ? Math.min(H / 600, W / 430) * 0.8
        : Math.min(H / 560, W / 1050) * 0.86;
  const cx = variant === 'panel' ? W / 2 : narrow ? W * 0.55 : W * 0.76;
  const ground = H * 0.94;
  const r = seeded(21);

  // Town hall, as lines with the moment each starts drawing.
  const lines: [number, number, number, number, number][] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, at: number) => lines.push([x1, y1, x2, y2, at]);
  const bw = 210 * k;
  const bx = cx - bw / 2;
  for (let i = 0; i < 3; i++) {
    line(bx - 14 * k + i * 6 * k, ground - i * 8 * k, bx + bw + 14 * k - i * 6 * k, ground - i * 8 * k, 0.1 + i * 0.08);
  }
  const base = ground - 24 * k;
  const colTop = base - 108 * k;
  for (let i = 0; i < 5; i++) {
    const x = bx + 18 * k + i * ((bw - 36 * k) / 4);
    line(x - 6 * k, base, x - 6 * k, colTop, 0.4 + i * 0.06);
    line(x + 6 * k, base, x + 6 * k, colTop, 0.43 + i * 0.06);
  }
  line(bx - 4 * k, colTop, bx + bw + 4 * k, colTop, 0.8);
  line(bx - 4 * k, colTop - 14 * k, bx + bw + 4 * k, colTop - 14 * k, 0.86);
  line(bx - 4 * k, colTop, bx - 4 * k, colTop - 14 * k, 0.86);
  line(bx + bw + 4 * k, colTop, bx + bw + 4 * k, colTop - 14 * k, 0.86);
  line(bx - 10 * k, colTop - 14 * k, cx, colTop - 62 * k, 1.0);
  line(cx, colTop - 62 * k, bx + bw + 10 * k, colTop - 14 * k, 1.05);
  line(bx - 10 * k, colTop - 14 * k, bx + bw + 10 * k, colTop - 14 * k, 1.0);
  line(cx, colTop - 62 * k, cx, colTop - 92 * k, 1.2);
  line(cx - 290 * k, ground, cx + 290 * k, ground, 0);

  // Rooftops behind, leaving the town hall clear.
  const roofs: { x: number; w: number; h: number; peak: boolean }[] = [];
  for (let x = cx - 300 * k; x < cx + 290 * k; ) {
    const w = (34 + r() * 30) * k;
    const h = (40 + r() * 46) * k;
    if (Math.abs(x + w / 2 - cx) > bw * 0.62) roofs.push({ x, w, h, peak: r() < 0.55 });
    x += w + 6 * k;
  }

  // Two trees, their canopies made of leaves.
  const trees = [cx - bw / 2 - 70 * k, cx + bw / 2 + 70 * k].map((tx, i) => buildTree(r, tx, ground, 64 * k, 5, 0.6 + i * 0.15, 0.14));
  const canopy: CanopyLeaf[] = [];
  for (const tree of trees) {
    for (const p of tree.twigs) {
      const n = 1 + (r() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        canopy.push({
          tx: p.x + (r() - 0.5) * 26 * k,
          ty: p.y + (r() - 0.5) * 21 * k,
          rot: (r() - 0.5) * 2.4,
          s: 0.24 * k * (0.8 + r() * 0.45),
          phase: r() * Math.PI * 2,
          ready: p.t,
        });
      }
    }
  }

  return { k, cx, ground, lines, roofs, trees, canopy, flag: { x: cx, y: colTop - 92 * k } };
}

const HERO_CLASSES = 'pointer-events-none absolute inset-0 z-0 h-full w-full opacity-40 lg:opacity-100';

export default function TownSquare({ variant = 'hero', className = HERO_CLASSES }: { variant?: Variant; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Line color from the app's theme (--color-fg is "r g b").
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--color-fg').trim() || '37 60 48';
    const ink = `rgb(${fg.split(/\s+/).join(',')})`;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let W = 0;
    let H = 0;
    let scene = buildScene(1, 1);
    let falling: FallingLeaf[] = [];
    let start = performance.now();
    let nextFall = 2.6;
    let frame = 0;
    const fallRandom = seeded(5);

    const draw = (t: number, isStill: boolean) => {
      const { k, ground, lines, roofs, trees, canopy, flag } = scene;
      const tt = isStill ? 99 : t;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.12 * clamp(tt / 1.2, 0, 1);
      for (const roof of roofs) {
        ctx.beginPath();
        ctx.moveTo(roof.x, ground);
        ctx.lineTo(roof.x, ground - roof.h);
        if (roof.peak) ctx.lineTo(roof.x + roof.w / 2, ground - roof.h - 16 * k);
        ctx.lineTo(roof.x + roof.w, ground - roof.h);
        ctx.lineTo(roof.x + roof.w, ground);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.55;
      for (const [x1, y1, x2, y2, at] of lines) {
        const p = ease((tt - at) / 0.55);
        if (p <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
        ctx.stroke();
      }
      ctx.restore();

      const fp = ease((tt - 1.4) / 0.6);
      if (fp > 0) {
        const wave = Math.sin(tt * 3) * 3 * k;
        ctx.save();
        ctx.globalAlpha = 0.9 * fp;
        ctx.fillStyle = LEAF_DARK;
        ctx.beginPath();
        ctx.moveTo(flag.x, flag.y);
        ctx.quadraticCurveTo(flag.x + 12 * k, flag.y + wave, flag.x + 24 * k * fp, flag.y + 4 * k);
        ctx.lineTo(flag.x + 22 * k * fp, flag.y + 14 * k + wave * 0.6);
        ctx.quadraticCurveTo(flag.x + 10 * k, flag.y + 12 * k - wave, flag.x, flag.y + 12 * k);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5;
      for (const tree of trees) {
        for (const s of tree.segs) {
          const p = clamp((tt - s.t0) / s.dur, 0, 1);
          if (p <= 0) continue;
          ctx.lineWidth = s.w;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + (s.x2 - s.x) * p, s.y + (s.y2 - s.y) * p);
          ctx.stroke();
        }
      }
      ctx.restore();

      for (const leaf of canopy) {
        const p = ease((tt - leaf.ready - 0.1) / 0.5);
        const sway = isStill ? 0 : Math.sin(t * 1.3 + leaf.phase) * 0.08;
        drawLeaf(ctx, leaf.tx, leaf.ty, leaf.rot + sway, leaf.s * p, 0.9 * p);
      }
      if (isStill) return;

      if (t > nextFall && canopy.length > 0) {
        const leaf = canopy[Math.floor(fallRandom() * canopy.length)];
        falling.push({ t0: t, x: leaf.tx, y: leaf.ty, rot: leaf.rot, s: leaf.s, ph: fallRandom() * 6, drift: (fallRandom() - 0.5) * 60 * k });
        nextFall = t + 1.2 + fallRandom() * 1.4;
      }
      falling = falling.filter((f) => {
        const ft = t - f.t0;
        const y = f.y + ft * 48 * k;
        const x = f.x + Math.sin(ft * 1.7 + f.ph) * 22 * k + f.drift * ft * 0.2;
        const alpha = clamp(ft / 0.4, 0, 1) * clamp(1 - (y - ground + 10 * k) / (30 * k), 0, 1) * 0.9;
        drawLeaf(ctx, x, y, f.rot + Math.sin(ft * 2 + f.ph) * 0.7, f.s, alpha);
        return !(alpha <= 0 && ft > 1);
      });
    };

    const loop = (now: number) => {
      draw((now - start) / 1000, false);
      frame = requestAnimationFrame(loop);
    };

    const setup = () => {
      cancelAnimationFrame(frame);
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width;
      H = rect.height;
      if (W === 0 || H === 0) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = buildScene(W, H, variant);
      falling = [];
      if (still.matches) {
        draw(0, true);
      } else {
        start = performance.now();
        nextFall = 2.6;
        frame = requestAnimationFrame(loop);
      }
    };

    // Redraw from the start only when the size really changes.
    let resizeTimer = 0;
    let lastSize = '';
    const observer = new ResizeObserver(() => {
      const size = `${Math.round(canvas.clientWidth)}x${Math.round(canvas.clientHeight)}`;
      if (size === lastSize) return;
      lastSize = size;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(setup, 120);
    });
    observer.observe(canvas);
    still.addEventListener('change', setup);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      still.removeEventListener('change', setup);
    };
  }, [variant]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
