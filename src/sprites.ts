// Pictures made from Kenney's Castle Kit (CC0, see art/castle-kit) by `npm run sprites`.
// Each is loaded the first time it is needed; until then the game draws its own shapes.
import manifest from './sprites.json';

export interface Sprite {
  img: HTMLImageElement;
  /** Size in game units, and where its ground point is (from the top-left corner). */
  w: number;
  h: number;
  ax: number;
  ay: number;
}

const SIZES = manifest as Record<string, { w: number; h: number; ax: number; ay: number }>;
const cache = new Map<string, Sprite | null>();

export function hasSprite(name: string): boolean {
  return name in SIZES;
}

/** The picture if it has loaded, otherwise null (and it starts loading). */
export function sprite(name: string): Sprite | null {
  if (!cache.has(name)) {
    const size = SIZES[name];
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
