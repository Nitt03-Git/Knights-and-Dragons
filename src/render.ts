// Draws the game with simple shapes. Phase 2 replaces these draw functions with real art;
// nothing in here changes the game.
import { makeRng } from './rng';
import { WORLD_H, WORLD_W, type Enemy, type Game, type Tower } from './sim';

export interface View {
  /** CSS pixels per world unit, and where the world's top-left corner sits on screen. */
  scale: number;
  ox: number;
  oy: number;
  dpr: number;
  width: number;
  height: number;
}

export function fitView(width: number, height: number, dpr: number): View {
  const scale = Math.min(width / WORLD_W, height / WORLD_H);
  return { scale, ox: (width - WORLD_W * scale) / 2, oy: (height - WORLD_H * scale) / 2, dpr, width, height };
}

export function toWorld(v: View, sx: number, sy: number) {
  return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
}

export function toScreen(v: View, x: number, y: number) {
  return { x: v.ox + x * v.scale, y: v.oy + y * v.scale };
}

const C = {
  grass: '#5b8a3c',
  grassDark: '#4a7631',
  grassLight: '#6e9c48',
  roadEdge: '#9c7a4b',
  road: '#d2b27a',
  roadLight: '#dcc08e',
  pad: '#8d8a83',
  padTop: '#b5b1a8',
  padRim: '#6d6a64',
  shadow: 'rgba(20, 30, 10, 0.28)',
  wood: '#8b5a2b',
  stone: '#c9c2b4',
  stoneDark: '#9d9585',
  archerRoof: '#2f7d4f',
  hpBack: 'rgba(0,0,0,0.55)',
  hp: '#7ed957',
  hpLow: '#f05a3c',
  gold: '#ffd54a',
};

const ENEMY_LOOK: Record<string, { body: string; belly: string }> = {
  kobold: { body: '#c0622d', belly: '#e8a060' },
  brute: { body: '#4f6b8a', belly: '#8aa4bf' },
  troll: { body: '#6b7d4a', belly: '#a3b07a' },
};

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  age: number;
}

interface Scenery {
  x: number;
  y: number;
  kind: 'tuft' | 'rock' | 'tree' | 'flower';
  size: number;
}

export class Renderer {
  private floaters: Floater[] = [];
  private scenery: Scenery[] = [];

  constructor(private ctx: CanvasRenderingContext2D, game: Game) {
    this.scenery = makeScenery(game);
  }

  draw(game: Game, v: View, dt: number, selectedPad: number | null): void {
    const ctx = this.ctx;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    // Grass fills the whole screen, also beyond the map on screens wider or taller than 16:9.
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, v.width, v.height);
    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);

    this.drawRoads(game);
    for (const s of this.scenery) if (s.kind !== 'tree') drawScenery(ctx, s);

    game.pads.forEach((p, i) => {
      if (!game.towers[i]) drawPad(ctx, p.x, p.y, i === selectedPad);
    });

    if (selectedPad !== null) {
      const t = game.towers[selectedPad];
      if (t) {
        const spec = game.towerLevel(t.type, t.level)!;
        const p = game.pads[selectedPad];
        ctx.beginPath();
        ctx.arc(p.x, p.y, spec.range, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 245, 200, 0.12)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 245, 200, 0.6)';
        ctx.setLineDash([12, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Everything that stands up is drawn back-to-front so lower things overlap higher ones.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    for (const s of this.scenery) if (s.kind === 'tree') items.push({ y: s.y, draw: () => drawScenery(ctx, s) });
    game.towers.forEach((t) => {
      if (t) items.push({ y: game.pads[t.pad].y, draw: () => drawTower(ctx, game, t) });
    });
    for (const e of game.enemies) items.push({ y: e.y, draw: () => drawEnemy(ctx, e, game.paths[e.path].length) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    for (const p of game.projectiles) {
      const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.strokeStyle = '#3b2a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(-18, -3, 5, 6);
      ctx.restore();
    }

    this.drawFloaters(game, dt);
  }

  private drawRoads(game: Game): void {
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const widths: [number, string][] = [
      [92, C.roadEdge],
      [80, C.road],
      [30, C.roadLight],
    ];
    for (const [w, color] of widths) {
      for (const path of game.paths) {
        // The road keeps going past both ends, so it never visibly stops on a wide screen.
        const s = path.samples;
        const a = s[0], a2 = s[Math.min(4, s.length - 1)];
        const z = s[s.length - 1], z2 = s[Math.max(0, s.length - 5)];
        const far = (p: { x: number; y: number }, q: { x: number; y: number }) => {
          const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
          return { x: p.x + ((p.x - q.x) / len) * 500, y: p.y + ((p.y - q.y) / len) * 500 };
        };
        const start = far(a, a2), end = far(z, z2);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (const p of s) ctx.lineTo(p.x, p.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
    // A banner where the road leaves the map: that is what the player defends.
    for (const path of game.paths) {
      const end = path.samples[path.samples.length - 1];
      const x = Math.min(WORLD_W - 30, end.x);
      const y = end.y - 70;
      ctx.fillStyle = '#5b3a1e';
      ctx.fillRect(x - 2, y, 5, 60);
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 3 - 34, y + 10);
      ctx.lineTo(x + 3, y + 22);
      ctx.fill();
    }
  }

  private drawFloaters(game: Game, dt: number): void {
    for (const ev of game.events) {
      if (ev.kind === 'gold') this.floaters.push({ text: `+${ev.amount}`, color: C.gold, x: ev.x, y: ev.y, age: 0 });
      if (ev.kind === 'leak') this.floaters.push({ text: `−${ev.lives} ♥`, color: '#ff6b5a', x: Math.min(ev.x, WORLD_W - 60), y: ev.y - 30, age: 0 });
    }
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = '700 26px Fredoka, system-ui, sans-serif';
    for (const f of this.floaters) {
      f.age += dt;
      const a = Math.max(0, 1 - f.age / 1.1);
      ctx.globalAlpha = a;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(40, 25, 10, 0.8)';
      ctx.strokeText(f.text, f.x, f.y - f.age * 40);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.age * 40);
    }
    ctx.globalAlpha = 1;
    this.floaters = this.floaters.filter((f) => f.age < 1.1);
  }
}

function makeScenery(game: Game): Scenery[] {
  const rng = makeRng(7);
  const out: Scenery[] = [];
  const clear = (x: number, y: number, r: number) =>
    game.pads.every((p) => Math.hypot(p.x - x, p.y - y) > r + 45) &&
    game.paths.every((path) => path.samples.every((s) => Math.hypot(s.x - x, s.y - y) > r + 50));
  for (let tries = 0; tries < 1400 && out.length < 220; tries++) {
    const x = -350 + rng() * (WORLD_W + 700);
    const y = -60 + rng() * (WORLD_H + 120);
    const roll = rng();
    const kind = roll < 0.12 ? 'tree' : roll < 0.22 ? 'rock' : roll < 0.35 ? 'flower' : 'tuft';
    const size = kind === 'tree' ? 26 + rng() * 14 : 5 + rng() * 6;
    if (clear(x, y, kind === 'tree' ? size : 4)) out.push({ x, y, kind, size });
  }
  return out;
}

function drawScenery(ctx: CanvasRenderingContext2D, s: Scenery): void {
  switch (s.kind) {
    case 'tuft':
      ctx.strokeStyle = C.grassLight;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const dx of [-4, 0, 4]) {
        ctx.moveTo(s.x + dx, s.y);
        ctx.lineTo(s.x + dx * 1.6, s.y - s.size);
      }
      ctx.stroke();
      break;
    case 'flower':
      ctx.fillStyle = s.size > 8 ? '#f4e285' : '#f2f2f2';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rock':
      ctx.fillStyle = C.stoneDark;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.size * 1.4, s.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.stone;
      ctx.beginPath();
      ctx.ellipse(s.x - 2, s.y - 2, s.size, s.size * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'tree':
      shadow(ctx, s.x, s.y, s.size * 0.9);
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(s.x - 4, s.y - 18, 8, 18);
      ctx.fillStyle = '#2f5d27';
      ctx.beginPath();
      ctx.arc(s.x, s.y - 18 - s.size * 0.6, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3d7432';
      ctx.beginPath();
      ctx.arc(s.x - s.size * 0.25, s.y - 22 - s.size * 0.75, s.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean): void {
  ctx.fillStyle = C.padRim;
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 40, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = selected ? '#e9d9a6' : C.padTop;
  ctx.beginPath();
  ctx.ellipse(x, y, 38, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.pad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 4);
  ctx.lineTo(x + 6, y + 8);
  ctx.moveTo(x + 4, y - 14);
  ctx.lineTo(x + 18, y);
  ctx.stroke();
}

function drawTower(ctx: CanvasRenderingContext2D, game: Game, t: Tower): void {
  const { x, y } = game.pads[t.pad];
  shadow(ctx, x, y + 4, 40);
  const recoil = t.shotAge < 0.1 ? 2 : 0;
  const w = 50;
  const h = 56 + t.level * 8;
  // Stone body
  ctx.fillStyle = C.stoneDark;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = C.stone;
  ctx.fillRect(x - w / 2 + 4, y - h, w - 12, h);
  ctx.strokeStyle = C.stoneDark;
  ctx.lineWidth = 2;
  for (let row = 1; row * 14 < h; row++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 4, y - row * 14);
    ctx.lineTo(x + w / 2 - 8, y - row * 14);
    ctx.stroke();
  }
  // Wooden platform and roof
  const top = y - h + recoil;
  ctx.fillStyle = C.wood;
  ctx.fillRect(x - w / 2 - 6, top - 8, w + 12, 10);
  ctx.fillStyle = C.archerRoof;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 10, top - 8);
  ctx.lineTo(x, top - 46);
  ctx.lineTo(x + w / 2 + 10, top - 8);
  ctx.closePath();
  ctx.fill();
  // Level pips
  ctx.fillStyle = C.gold;
  for (let i = 0; i <= t.level; i++) {
    ctx.beginPath();
    ctx.arc(x - (t.level * 8) / 2 + i * 8, y - 14, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, roadLength: number): void {
  // Fade in and out at the ends of the road instead of popping.
  ctx.globalAlpha = Math.max(0, Math.min(1, e.d / 60, (roadLength - e.d) / 60));
  const r = e.spec.size;
  const look = ENEMY_LOOK[e.type] ?? { body: '#999', belly: '#ccc' };
  const bob = Math.abs(Math.sin(e.d / 9)) * 3;
  shadow(ctx, e.x, e.y, r);
  const cy = e.y - r - bob;
  ctx.fillStyle = e.hitAge < 0.08 ? '#ffffff' : look.body;
  ctx.beginPath();
  ctx.arc(e.x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.belly;
  ctx.beginPath();
  ctx.ellipse(e.x, cy + r * 0.3, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(e.x - r * 0.35, cy - r * 0.25, r * 0.22, 0, Math.PI * 2);
  ctx.arc(e.x + r * 0.35, cy - r * 0.25, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1208';
  ctx.beginPath();
  ctx.arc(e.x - r * 0.3, cy - r * 0.25, r * 0.1, 0, Math.PI * 2);
  ctx.arc(e.x + r * 0.4, cy - r * 0.25, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (e.spec.armor > 0) {
    ctx.strokeStyle = '#d9dde3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, cy, r - 1, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  if (e.hp < e.spec.hp) {
    const w = Math.max(28, r * 2.4);
    const f = Math.max(0, e.hp / e.spec.hp);
    const by = cy - r - 12;
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(e.x - w / 2 - 1, by - 1, w + 2, 7);
    ctx.fillStyle = f > 0.35 ? C.hp : C.hpLow;
    ctx.fillRect(e.x - w / 2, by, w * f, 5);
  }
  ctx.globalAlpha = 1;
}
