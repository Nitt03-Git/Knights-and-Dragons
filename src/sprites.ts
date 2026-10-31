// Pictures made from Kenney's Castle Kit (CC0, see art/castle-kit) by `npm run sprites`.
// Each is loaded the first time it is needed; until then the game draws its own shapes.
import manifest from './sprites.json';

export interface Sprite {
  img: HTMLImageElement;
  /** Size in game units (one frame), and where its ground point is (from the top-left corner). */
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** Animations: how many frames side by side, and whether a mask (for tinting) comes with it. */
  frames?: number;
  mask?: boolean;
}

const SIZES = manifest as Record<string, { w: number; h: number; ax: number; ay: number; frames?: number; mask?: boolean }>;
const cache = new Map<string, Sprite | null>();

export function hasSprite(name: string): boolean {
  return name in SIZES || (name.endsWith('-mask') && !!SIZES[name.slice(0, -5)]?.mask);
}

/** The picture if it has loaded, otherwise null (and it starts loading). */
export function sprite(name: string): Sprite | null {
  if (!cache.has(name)) {
    // A mask is the same size as its strip.
    const size = SIZES[name] ?? (name.endsWith('-mask') ? SIZES[name.slice(0, -5)] : undefined);
    if (!size || typeof Image === 'undefined') {
      cache.set(name, null);
      return null;
    }
    const img = new Image();
    const s: Sprite = { img, ...size };
    cache.set(name, null);
    img.onload = () => cache.set(name, s);
    img.src = `${import.meta.env.BASE_URL}sprites/${name}.png`;
  }
  return cache.get(name) ?? null;
}

/** Starts loading pictures ahead of time, so they are ready when first drawn. */
export function preload(names: string[]): void {
  for (const n of names) sprite(n);
}

/** Draws a picture with its ground point at (x, y); false when it isn't ready (draw shapes instead). */
export function drawSprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number): Sprite | null {
  const s = sprite(name);
  if (s) ctx.drawImage(s.img, x - s.ax, y - s.ay, s.w, s.h);
  return s;
}

// ---- Animations: a strip of frames, mirrored to face right, the armour tinted, a white flash ----

const tinted = new Map<string, HTMLCanvasElement | null>();

/** The strip with its mask's part coloured (multiplied), made once per colour; or a white silhouette. */
function strip(name: string, tint: string | null, white = false): CanvasImageSource | null {
  const s = sprite(name);
  if (!s) return null;
  if (!tint && !white) return s.img;
  const key = `${name}|${white ? 'white' : tint}`;
  if (tinted.has(key)) return tinted.get(key) ?? null;
  const mask = white ? null : sprite(`${name}-mask`);
  if (!white && !mask) return s.img;
  if (typeof document === 'undefined') return s.img;
  const c = document.createElement('canvas');
  c.width = s.img.naturalWidth;
  c.height = s.img.naturalHeight;
  const g = c.getContext('2d')!;
  if (white) {
    g.drawImage(s.img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
  } else {
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    const tg = t.getContext('2d')!;
    tg.drawImage(mask!.img, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = tint!;
    tg.fillRect(0, 0, c.width, c.height);
    g.drawImage(s.img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(t, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(s.img, 0, 0);
  }
  tinted.set(key, c);
  return c;
}

export function frameCount(name: string): number {
  return SIZES[name]?.frames ?? 1;
}

/**
 * Draws frame `frame` of an animation strip with its ground point at (x, y), `size` times as big.
 * The pictures face left; `faceRight` mirrors them. Returns false when not loaded yet.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D, name: string, frame: number, x: number, y: number,
  o: { faceRight?: boolean; size?: number; tint?: string | null; flash?: boolean } = {},
): Sprite | null {
  const s = sprite(name);
  if (!s) return null;
  if (s.mask) sprite(`${name}-mask`);
  const img = strip(name, o.tint ?? null);
  if (!img) return null;
  const n = s.frames ?? 1;
  const f = ((Math.floor(frame) % n) + n) % n;
  const pw = s.img.naturalWidth / n;
  const ph = s.img.naturalHeight;
  const k = o.size ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(o.faceRight ? -k : k, k);
  ctx.drawImage(img, f * pw, 0, pw, ph, -s.ax, -s.ay, s.w, s.h);
  if (o.flash) {
    const w = strip(name, null, true);
    if (w) {
      ctx.globalAlpha *= 0.75;
      ctx.drawImage(w, f * pw, 0, pw, ph, -s.ax, -s.ay, s.w, s.h);
    }
  }
  ctx.restore();
  return s;
}
