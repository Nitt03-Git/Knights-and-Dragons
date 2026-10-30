// Draws the game with simple shapes. Phase 2 replaces these draw functions with real art;
// nothing in here changes the game.
import { makeRng } from './rng';
import { FLY_HEIGHT, WORLD_H, WORLD_W, type Enemy, type Game, type Hero, type Knight, type Projectile, type Tower } from './sim';

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

/** How far the player can zoom in, compared with the whole map on screen. */
export const MAX_ZOOM = 2.5;

/** Keeps the map filling the screen: no panning past its edges, centred when it's smaller. */
export function clampView(v: View): View {
  const ww = WORLD_W * v.scale;
  const wh = WORLD_H * v.scale;
  const ox = ww <= v.width ? (v.width - ww) / 2 : Math.min(0, Math.max(v.width - ww, v.ox));
  const oy = wh <= v.height ? (v.height - wh) / 2 : Math.min(0, Math.max(v.height - wh, v.oy));
  return { ...v, ox, oy };
}

/** Zooms by `factor` around the screen point (fx, fy), between the fitted view and MAX_ZOOM. */
export function zoomView(v: View, fitted: View, factor: number, fx: number, fy: number): View {
  const scale = Math.min(fitted.scale * MAX_ZOOM, Math.max(fitted.scale, v.scale * factor));
  const f = scale / v.scale;
  return clampView({ ...v, scale, ox: fx - (fx - v.ox) * f, oy: fy - (fy - v.oy) * f });
}

export function panView(v: View, dx: number, dy: number): View {
  return clampView({ ...v, ox: v.ox + dx, oy: v.oy + dy });
}

/** What the screen wants drawn on top of the game: selections, previews, a flag being dragged. */
export interface Overlay {
  selected: number | null;
  placingFlag: boolean;
  /** Range preview before building or upgrading: this tower type at this level on this pad. */
  preview: { pad: number; type: string; level: number } | null;
  /** A hall's flag being dragged: the finger, and where the flag would land (null: not allowed there). */
  drag: { pad: number; x: number; y: number; snap: { x: number; y: number } | null } | null;
  /** The hero is selected (waiting for where to ride), or being dragged to (x, y). */
  heroSelected: boolean;
  heroDrag: { x: number; y: number } | null;
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
  hallRoof: '#2f5d9a',
  steel: '#d4d9e0',
  steelDark: '#8d96a3',
  tabard: '#2f5d9a',
  hpBack: 'rgba(0,0,0,0.55)',
  hp: '#7ed957',
  hpLow: '#f05a3c',
  gold: '#ffd54a',
};

const ENEMY_LOOK: Record<string, { body: string; belly: string }> = {
  kobold: { body: '#c0622d', belly: '#e8a060' },
  brute: { body: '#4f6b8a', belly: '#8aa4bf' },
  troll: { body: '#6b7d4a', belly: '#a3b07a' },
  hexling: { body: '#6a3d8f', belly: '#b58bd6' },
  wyrmling: { body: '#3f8f5a', belly: '#a8d98a' },
};

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  age: number;
}

interface Boom {
  x: number;
  y: number;
  radius: number;
  age: number;
  stomp: boolean;
}

interface Scenery {
  x: number;
  y: number;
  kind: 'tuft' | 'rock' | 'tree' | 'flower';
  size: number;
}

export class Renderer {
  private floaters: Floater[] = [];
  private booms: Boom[] = [];
  /** Which way the hero faces (1 right, -1 left), from how it last moved. */
  private heroFacing = 1;
  private heroLastX = 0;
  private scenery: Scenery[] = [];

  constructor(private ctx: CanvasRenderingContext2D, game: Game) {
    this.scenery = makeScenery(game);
  }

  draw(game: Game, v: View, dt: number, o: Overlay): void {
    const ctx = this.ctx;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    // Grass fills the whole screen, also beyond the map on screens wider or taller than 16:9.
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, v.width, v.height);
    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);

    this.drawRoads(game);
    for (const s of this.scenery) if (s.kind !== 'tree') drawScenery(ctx, s);

    game.pads.forEach((p, i) => {
      if (!game.towers[i]) drawPad(ctx, p.x, p.y, i === o.selected);
    });

    const rangeOf = (type: string, level: number) => game.towerLevel(type, level);
    if (o.preview) {
      const spec = rangeOf(o.preview.type, o.preview.level);
      const p = game.pads[o.preview.pad];
      if (spec) drawRange(ctx, p.x, p.y, spec.range, !!spec.unit, true);
    } else {
      const pad = o.drag?.pad ?? o.selected;
      const t = pad === null ? null : game.towers[pad];
      if (t && pad !== null) {
        const spec = rangeOf(t.type, t.level)!;
        const p = game.pads[pad];
        drawRange(ctx, p.x, p.y, spec.range, !!spec.unit, o.placingFlag || !!o.drag);
      }
    }
    game.towers.forEach((t, i) => {
      if (t?.rally) drawFlag(ctx, t.rally.x, t.rally.y, i === o.selected && !o.drag, 1);
    });
    if (o.drag) {
      if (o.drag.snap) drawFlag(ctx, o.drag.snap.x, o.drag.snap.y, true, 0.75);
      else drawCross(ctx, o.drag.x, o.drag.y);
    }
    // Preview of a new hall: where its flag would go.
    if (o.preview?.type === 'knights' && !game.towers[o.preview.pad]) {
      const r = game.defaultRally(o.preview.pad);
      if (r) drawFlag(ctx, r.x, r.y, true, 0.6);
    }

    const hero = game.hero;
    if (hero.state !== 'dead') {
      if (game.abilities.has('rally')) {
        // Rallying Banner: knights inside this ring get the boost.
        ctx.strokeStyle = 'rgba(255, 213, 74, 0.55)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.ellipse(hero.x, hero.y, game.balance.hero.rally.radius, game.balance.hero.rally.radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (o.heroSelected || o.heroDrag) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(hero.x, hero.y, 34, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (o.heroDrag) drawMarker(ctx, o.heroDrag.x, o.heroDrag.y);
    else if (hero.dest) drawMarker(ctx, hero.dest.x, hero.dest.y);
    if (Math.abs(hero.x - this.heroLastX) > 0.5) this.heroFacing = hero.x > this.heroLastX ? 1 : -1;
    this.heroLastX = hero.x;
    const facing = this.heroFacing;

    // Everything that stands up is drawn back-to-front so lower things overlap higher ones.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    for (const s of this.scenery) if (s.kind === 'tree') items.push({ y: s.y, draw: () => drawScenery(ctx, s) });
    game.towers.forEach((t) => {
      if (t) items.push({ y: game.pads[t.pad].y, draw: () => drawTower(ctx, game, t) });
    });
    // A see-through tower where one is about to be built.
    if (o.preview && !game.towers[o.preview.pad]) {
      const ghost: Tower = { pad: o.preview.pad, type: o.preview.type, level: 0, cooldown: 0, spent: 0, shotAge: 9, rally: null, knights: [] };
      items.push({
        y: game.pads[o.preview.pad].y,
        draw: () => {
          ctx.globalAlpha = 0.55;
          drawTower(ctx, game, ghost);
          ctx.globalAlpha = 1;
        },
      });
    }
    // Flyers are drawn after everything that stands on the ground.
    for (const e of game.enemies) if (!e.spec.flying) items.push({ y: e.y, draw: () => drawEnemy(ctx, e, game.paths[e.path].length) });
    game.towers.forEach((t) => {
      const unit = t && game.towerLevel(t.type, t.level)?.unit;
      if (t && unit) for (const k of t.knights) if (k.state !== 'dead') items.push({ y: k.y, draw: () => drawKnight(ctx, k, unit.hp, game.time) });
    });
    if (hero.state !== 'dead') items.push({ y: hero.y, draw: () => drawHero(ctx, hero, game.balance.hero.hp, game.time, facing) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    for (const e of game.enemies) if (e.spec.flying) drawEnemy(ctx, e, game.paths[e.path].length);
    for (const p of game.projectiles) drawProjectile(ctx, p);
    this.drawBooms(game, dt);

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
      const x = Math.max(30, Math.min(WORLD_W - 30, end.x));
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

  private drawBooms(game: Game, dt: number): void {
    for (const ev of game.events) if (ev.kind === 'boom') this.booms.push({ x: ev.x, y: ev.y, radius: ev.radius, age: 0, stomp: !!ev.stomp });
    const ctx = this.ctx;
    for (const b of this.booms) {
      b.age += dt;
      const f = Math.min(1, b.age / 0.45);
      ctx.globalAlpha = 1 - f;
      ctx.fillStyle = b.stomp ? 'rgba(255, 213, 74, 0.3)' : 'rgba(120, 90, 50, 0.45)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.radius * (0.5 + f * 0.6), b.radius * (0.25 + f * 0.3), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = b.stomp ? 5 : 3;
      ctx.strokeStyle = b.stomp ? 'rgba(255, 213, 74, 0.95)' : 'rgba(255, 220, 160, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.radius * f, b.radius * f * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.booms = this.booms.filter((b) => b.age < 0.45);
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

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  if (p.kind === 'shell') {
    // A stone on a high arc, with its shadow on the ground below.
    const lift = (1 - p.t) * 50 + 4 * 120 * p.t * (1 - p.t);
    ctx.fillStyle = 'rgba(20, 30, 10, 0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d766a';
    ctx.beginPath();
    ctx.arc(p.x, p.y - lift, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a39b8c';
    ctx.beginPath();
    ctx.arc(p.x - 3, p.y - lift - 3, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (p.kind === 'bolt') {
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
    glow.addColorStop(0, 'rgba(255, 240, 255, 1)');
    glow.addColorStop(0.35, 'rgba(200, 120, 255, 0.9)');
    glow.addColorStop(1, 'rgba(140, 60, 220, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
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

function drawWizardTower(ctx: CanvasRenderingContext2D, game: Game, t: Tower): void {
  const { x, y } = game.pads[t.pad];
  shadow(ctx, x, y + 4, 36);
  const w = 40;
  const h = 64 + t.level * 8;
  ctx.fillStyle = '#9d93a8';
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = '#c9c0d2';
  ctx.fillRect(x - w / 2 + 4, y - h, w - 12, h);
  // Window
  ctx.fillStyle = '#3a2350';
  ctx.beginPath();
  ctx.arc(x - 2, y - h + 22, 5, Math.PI, 0);
  ctx.lineTo(x + 3, y - h + 32);
  ctx.lineTo(x - 7, y - h + 32);
  ctx.fill();
  // Tall pointed roof
  ctx.fillStyle = '#5b2d86';
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 8, y - h);
  ctx.lineTo(x, y - h - 56);
  ctx.lineTo(x + w / 2 + 8, y - h);
  ctx.closePath();
  ctx.fill();
  // Glowing orb on top: brighter just after a shot
  const flash = t.shotAge < 0.25 ? 1 - t.shotAge / 0.25 : 0;
  const r = 7 + flash * 4;
  const glow = ctx.createRadialGradient(x, y - h - 60, 0, x, y - h - 60, r * 2.4);
  glow.addColorStop(0, 'rgba(255, 240, 255, 1)');
  glow.addColorStop(0.4, `rgba(200, 120, 255, ${0.7 + flash * 0.3})`);
  glow.addColorStop(1, 'rgba(140, 60, 220, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - h - 60, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  levelPips(ctx, x, y - 12, t.level);
}

function drawCatapult(ctx: CanvasRenderingContext2D, game: Game, t: Tower): void {
  const { x, y } = game.pads[t.pad];
  shadow(ctx, x, y + 4, 44);
  // Stone platform
  ctx.fillStyle = C.stoneDark;
  ctx.fillRect(x - 34, y - 20, 68, 20);
  ctx.fillStyle = C.stone;
  ctx.fillRect(x - 30, y - 20, 56, 16);
  // Wooden frame
  ctx.strokeStyle = C.wood;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 20);
  ctx.lineTo(x - 4, y - 52 - t.level * 4);
  ctx.lineTo(x + 12, y - 20);
  ctx.stroke();
  // Throwing arm: flung forward just after a shot, then wound back
  const spec = game.towerLevel(t.type, t.level)!;
  const back = Math.min(1, t.shotAge / (spec.cooldown * 0.6));
  const angle = -0.35 - (1 - back) * 1.6 + back * 0.0;
  const px = x - 4;
  const py = y - 48 - t.level * 4;
  const len = 46;
  const ex = px + Math.cos(Math.PI + angle) * len;
  const ey = py + Math.sin(Math.PI + angle) * len * -1;
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(px - (ex - px) * 0.3, py - (ey - py) * 0.3);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // Stone in the bucket once loaded
  if (back >= 1) {
    ctx.fillStyle = '#7d766a';
    ctx.beginPath();
    ctx.arc(ex, ey - 6, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  levelPips(ctx, x, y - 8, t.level);
}

function drawTower(ctx: CanvasRenderingContext2D, game: Game, t: Tower): void {
  if (t.type === 'knights') return drawHall(ctx, game, t);
  if (t.type === 'wizard') return drawWizardTower(ctx, game, t);
  if (t.type === 'catapult') return drawCatapult(ctx, game, t);
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
  levelPips(ctx, x, y - 14, t.level);
}

function levelPips(ctx: CanvasRenderingContext2D, x: number, y: number, level: number): void {
  ctx.fillStyle = C.gold;
  for (let i = 0; i <= level; i++) {
    ctx.beginPath();
    ctx.arc(x - (level * 8) / 2 + i * 8, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHall(ctx: CanvasRenderingContext2D, game: Game, t: Tower): void {
  const { x, y } = game.pads[t.pad];
  shadow(ctx, x, y + 4, 44);
  const w = 70;
  const h = 34 + t.level * 5;
  ctx.fillStyle = C.stoneDark;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = C.stone;
  ctx.fillRect(x - w / 2 + 4, y - h, w - 12, h);
  // Door
  ctx.fillStyle = '#5b3a1e';
  ctx.beginPath();
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x - 9, y - 16);
  ctx.arc(x, y - 16, 9, Math.PI, 0);
  ctx.lineTo(x + 9, y);
  ctx.fill();
  // Roof
  ctx.fillStyle = C.hallRoof;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 8, y - h);
  ctx.lineTo(x - w / 2 + 12, y - h - 30);
  ctx.lineTo(x + w / 2 - 12, y - h - 30);
  ctx.lineTo(x + w / 2 + 8, y - h);
  ctx.closePath();
  ctx.fill();
  // Banner pole on the roof
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(x + 18, y - h - 58, 3, 30);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.moveTo(x + 21, y - h - 58);
  ctx.lineTo(x + 40, y - h - 52);
  ctx.lineTo(x + 21, y - h - 46);
  ctx.fill();
  levelPips(ctx, x, y - h - 12, t.level);
}

function drawRange(ctx: CanvasRenderingContext2D, x: number, y: number, range: number, hall: boolean, strong: boolean): void {
  // Bowmen: how far they shoot (warm). Halls: how far the flag may go (blue).
  const tint = hall ? '170, 205, 255' : '255, 245, 200';
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${tint}, ${strong ? 0.2 : 0.12})`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(${tint}, ${strong ? 0.9 : 0.7})`;
  ctx.setLineDash([12, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(224, 83, 61, 0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 12);
  ctx.lineTo(x + 12, y + 12);
  ctx.moveTo(x + 12, y - 12);
  ctx.lineTo(x - 12, y + 12);
  ctx.stroke();
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean, alpha: number): void {
  const s = big ? 1.3 : 0.85;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(20, 30, 10, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, 8 * s, 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(x - 1.5 * s, y - 34 * s, 3 * s, 34 * s);
  ctx.fillStyle = C.tabard;
  ctx.beginPath();
  ctx.moveTo(x + 1.5 * s, y - 34 * s);
  ctx.lineTo(x + 22 * s, y - 28 * s);
  ctx.lineTo(x + 1.5 * s, y - 20 * s);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(255, 213, 74, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y - 30);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 213, 74, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x + 16, y - 25);
  ctx.lineTo(x, y - 20);
  ctx.fill();
}

/** The hero: a knight on a horse, facing `facing` (1 right, -1 left). */
function drawHero(ctx: CanvasRenderingContext2D, h: Hero, maxHp: number, time: number, facing: number): void {
  const moving = h.state === 'walking';
  const gallop = moving ? Math.sin(time * 16) : 0;
  shadow(ctx, h.x, h.y, 30);
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.scale(facing, 1);
  const bob = moving ? Math.abs(gallop) * 3 : 0;
  // Legs
  ctx.strokeStyle = '#5a3a20';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const [lx, phase] of [[-16, 0], [-8, 1], [10, 1], [18, 0]] as const) {
    const swing = moving ? Math.sin(time * 16 + phase * Math.PI) * 6 : 0;
    ctx.beginPath();
    ctx.moveTo(lx, -20 - bob);
    ctx.lineTo(lx + swing, -2);
    ctx.stroke();
  }
  // Horse body, neck and head
  ctx.fillStyle = h.hitAge < 0.08 ? '#ffffff' : '#8a5a33';
  ctx.beginPath();
  ctx.ellipse(0, -26 - bob, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, -32 - bob);
  ctx.lineTo(28, -50 - bob);
  ctx.lineTo(36, -46 - bob);
  ctx.lineTo(26, -26 - bob);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(36, -46 - bob, 9, 5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // Mane and tail
  ctx.strokeStyle = '#3b2414';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(18, -36 - bob);
  ctx.lineTo(27, -52 - bob);
  ctx.moveTo(-25, -28 - bob);
  ctx.quadraticCurveTo(-36, -24 - bob, -34, -12 - bob + gallop * 2);
  ctx.stroke();
  // Blue caparison (horse blanket)
  ctx.fillStyle = C.tabard;
  ctx.fillRect(-14, -34 - bob, 20, 14);
  ctx.fillStyle = C.gold;
  ctx.fillRect(-14, -22 - bob, 20, 2);
  // Rider
  const ry = -44 - bob;
  ctx.fillStyle = h.hitAge < 0.08 ? '#ffffff' : C.steel;
  ctx.beginPath();
  ctx.arc(-2, ry, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-2, ry - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.steelDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, ry - 15);
  ctx.lineTo(4, ry - 15);
  ctx.stroke();
  // Red plume
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-4, ry - 20);
  ctx.quadraticCurveTo(-16, ry - 30, -18, ry - 16);
  ctx.quadraticCurveTo(-10, ry - 22, -2, ry - 19);
  ctx.fill();
  // Sword, swinging while fighting
  const swing = h.state === 'fighting' ? Math.sin(time * 9) * 0.9 : 0.4;
  ctx.save();
  ctx.translate(6, ry);
  ctx.rotate(-1.1 + swing);
  ctx.strokeStyle = '#eef2f6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -24);
  ctx.stroke();
  ctx.restore();
  // Shield with a gold rim
  ctx.fillStyle = C.tabard;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, ry - 6);
  ctx.lineTo(-6, ry - 6);
  ctx.lineTo(-6, ry + 4);
  ctx.lineTo(-11, ry + 9);
  ctx.lineTo(-16, ry + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Health bar (gold-edged so it stands out from the knights')
  if (h.hp < maxHp) {
    const w = 44;
    const f = Math.max(0, h.hp / maxHp);
    const by = h.y - 84;
    ctx.fillStyle = C.gold;
    ctx.fillRect(h.x - w / 2 - 2, by - 2, w + 4, 9);
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(h.x - w / 2, by, w, 5);
    ctx.fillStyle = f > 0.35 ? C.hp : C.hpLow;
    ctx.fillRect(h.x - w / 2, by, w * f, 5);
  }
}

function drawKnight(ctx: CanvasRenderingContext2D, k: Knight, maxHp: number, time: number): void {
  // Drawn at 10 units and scaled up around the feet.
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.scale(1.4, 1.4);
  ctx.translate(-k.x, -k.y);
  const r = 10;
  const bob = k.state === 'walking' ? Math.abs(Math.sin(time * 12 + k.id)) * 2.5 : 0;
  shadow(ctx, k.x, k.y, r);
  const cy = k.y - r - 2 - bob;
  // Body with blue tabard
  ctx.fillStyle = k.hitAge < 0.08 ? '#ffffff' : C.steel;
  ctx.beginPath();
  ctx.arc(k.x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.tabard;
  ctx.fillRect(k.x - 5, cy - 2, 10, 10);
  // Helmet visor
  ctx.strokeStyle = C.steelDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(k.x - 5, cy - 5);
  ctx.lineTo(k.x + 5, cy - 5);
  ctx.stroke();
  // Sword: swings while fighting
  const swing = k.state === 'fighting' ? Math.sin(time * 10 + k.id) * 0.9 : 0.3;
  ctx.save();
  ctx.translate(k.x + 8, cy);
  ctx.rotate(-1.2 + swing);
  ctx.strokeStyle = '#eef2f6';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -16);
  ctx.stroke();
  ctx.restore();
  // Shield
  ctx.fillStyle = C.tabard;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(k.x - 13, cy - 5);
  ctx.lineTo(k.x - 5, cy - 5);
  ctx.lineTo(k.x - 5, cy + 3);
  ctx.lineTo(k.x - 9, cy + 7);
  ctx.lineTo(k.x - 13, cy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (k.hp < maxHp) {
    const w = 24;
    const f = Math.max(0, k.hp / maxHp);
    const by = cy - r - 10;
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(k.x - w / 2 - 1, by - 1, w + 2, 6);
    ctx.fillStyle = f > 0.35 ? '#6fb8ff' : C.hpLow;
    ctx.fillRect(k.x - w / 2, by, w * f, 4);
  }
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, roadLength: number): void {
  // Fade in and out at the ends of the road instead of popping.
  ctx.globalAlpha = Math.max(0, Math.min(1, e.d / 60, (roadLength - e.d) / 60));
  const r = e.spec.size;
  const look = ENEMY_LOOK[e.type] ?? { body: '#999', belly: '#ccc' };
  const flying = !!e.spec.flying;
  const bob = flying ? Math.sin(e.d / 14) * 4 : Math.abs(Math.sin(e.d / 9)) * 3;
  shadow(ctx, e.x, e.y, flying ? r * 0.7 : r);
  const cy = e.y - r - bob - (flying ? FLY_HEIGHT : 0);
  if (flying) {
    // Flapping wings behind the body
    const flap = Math.sin(e.d / 6) * 0.6;
    ctx.fillStyle = look.belly;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(e.x + side * r * 0.4, cy);
      ctx.lineTo(e.x + side * r * 2.2, cy - r * (0.8 + flap));
      ctx.lineTo(e.x + side * r * 1.6, cy + r * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }
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
  if (e.type === 'hexling') {
    // Pointed hood
    ctx.fillStyle = look.body;
    ctx.beginPath();
    ctx.moveTo(e.x - r * 0.8, cy - r * 0.5);
    ctx.lineTo(e.x + r * 0.2, cy - r * 2);
    ctx.lineTo(e.x + r * 0.8, cy - r * 0.5);
    ctx.fill();
  }
  if ((e.spec.magicResist ?? 0) > 0) {
    // Shimmer: magic slides off
    ctx.strokeStyle = 'rgba(220, 170, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(e.x, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
