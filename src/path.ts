import type { Point } from './types';

export interface PathSample {
  x: number;
  y: number;
  /** Unit normal (pointing to the walker's left), used for side-by-side lanes. */
  nx: number;
  ny: number;
  /** Distance along the road from its start. */
  d: number;
}

export interface Path {
  samples: PathSample[];
  length: number;
}

/** Rounds the corners of a polyline by cutting each corner, `iterations` times (Chaikin). */
export function chaikin(points: Point[], iterations = 3): Point[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const next: Point[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/** Smooths the control points and resamples them every `spacing` world units. */
export function buildPath(points: Point[], spacing = 6): Path {
  const smooth = chaikin(points);
  const cum = [0];
  for (let i = 1; i < smooth.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(smooth[i][0] - smooth[i - 1][0], smooth[i][1] - smooth[i - 1][1]));
  }
  const length = cum[cum.length - 1];
  const count = Math.max(2, Math.ceil(length / spacing) + 1);
  const samples: PathSample[] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / (count - 1)) * length;
    while (seg < smooth.length - 2 && cum[seg + 1] < d) seg++;
    const segLen = cum[seg + 1] - cum[seg] || 1e-9;
    const t = Math.min(1, Math.max(0, (d - cum[seg]) / segLen));
    const [x0, y0] = smooth[seg];
    const [x1, y1] = smooth[seg + 1];
    samples.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx: 0, ny: 0, d });
  }
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    samples[i].nx = (b.y - a.y) / len;
    samples[i].ny = -(b.x - a.x) / len;
  }
  return { samples, length };
}

/** Position `d` along the road, shifted `offset` units sideways. */
export function pointAt(path: Path, d: number, offset = 0): { x: number; y: number } {
  const s = path.samples;
  const step = path.length / (s.length - 1);
  const f = Math.min(s.length - 1.000001, Math.max(0, d / step));
  const i = Math.floor(f);
  const t = f - i;
  const a = s[i];
  const b = s[i + 1];
  const nx = a.nx + (b.nx - a.nx) * t;
  const ny = a.ny + (b.ny - a.ny) * t;
  return { x: a.x + (b.x - a.x) * t + nx * offset, y: a.y + (b.y - a.y) * t + ny * offset };
}

/** Shortest distance from a point to the road's centre line. */
export function distanceToPath(path: Path, x: number, y: number): number {
  let best = Infinity;
  const s = path.samples;
  for (let i = 0; i < s.length - 1; i++) {
    const ax = s[i].x, ay = s[i].y;
    const dx = s[i + 1].x - ax, dy = s[i + 1].y - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}
