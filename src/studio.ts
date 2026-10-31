// Level Studio: draw roads, place stone spots, edit waves, test the level, and copy it as JSON
// to paste into the chat (Claude then adds it to data/levels.json). The draft is kept on the phone.
import { BALANCE, LEVELS } from './data';
import { buildPath, distanceToPath } from './path';
import { Renderer, toWorld, type View } from './render';
import { Game, WORLD_H, WORLD_W } from './sim';
import type { Level, Point, WaveGroup } from './types';

const KEY = 'knights-and-dragons.studio.v1';
const MAX_ROADS = 3;
/** How far beyond the map a road end is pushed when it is drawn near an edge. */
const OFF_MAP = 140;
/** Stone spot rules, matching the checks in test/sim.test.ts. */
export const SPOT_RULES = { roadGap: 75, spotGap: 100, minX: 40, maxX: WORLD_W - 40, minY: 90, maxY: WORLD_H - 40 };

type Tool = 'road' | 'spots';

export interface StudioHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: () => View;
  showCard: (html: string, buttons: { text: string; main?: boolean; onClick: () => void }[]) => void;
  hideCard: () => void;
  card: HTMLElement;
  onTest: (level: Level) => void;
  onExit: () => void;
}

/** A fresh level: no roads or spots yet, three gentle waves to test with. */
export function blankLevel(): Level {
  return {
    id: 'my-level',
    name: 'My level',
    startGold: 260,
    paths: [],
    pads: [],
    waves: [
      { groups: [{ enemy: 'kobold', count: 8, interval: 1.2 }] },
      { groups: [{ enemy: 'kobold', count: 10, interval: 1 }, { enemy: 'brute', count: 2, interval: 3, delay: 6 }] },
      { groups: [{ enemy: 'brute', count: 4, interval: 2 }, { enemy: 'hexling', count: 2, interval: 2, delay: 4 }, { enemy: 'wyrmling', count: 2, interval: 2, delay: 8 }] },
    ],
  };
}

/**
 * Turns a finger stroke (world points, in walking order) into road control points: one point
 * every ~50 units, and ends near the map's edge pushed off the map so enemies walk in and out.
 */
export function strokeToRoad(stroke: Point[]): Point[] {
  if (stroke.length < 2) return stroke;
  const pts: Point[] = [stroke[0]];
  let run = 0;
  for (let i = 1; i < stroke.length; i++) {
    run += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
    if (run >= 50) {
      pts.push(stroke[i]);
      run = 0;
    }
  }
  const lastPt = stroke[stroke.length - 1];
  if (pts[pts.length - 1] !== lastPt) pts.push(lastPt);

  const offMap = ([x, y]: Point): Point | null => {
    const gaps = [x, WORLD_W - x, y, WORLD_H - y];
    const min = Math.min(...gaps);
    if (min > 120) return null;
    const side = gaps.indexOf(min);
    return side === 0 ? [-OFF_MAP, y] : side === 1 ? [WORLD_W + OFF_MAP, y] : side === 2 ? [x, -OFF_MAP] : [x, WORLD_H + OFF_MAP];
  };
  const start = offMap(pts[0]);
  const end = offMap(pts[pts.length - 1]);
  if (start) pts.unshift(start);
  if (end) pts.push(end);
  return pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

export interface LevelCheck {
  /** Per stone spot: fine, or why it is red. */
  spots: ('ok' | 'road' | 'crowded' | 'edge')[];
  /** Reasons the level can't be tested or copied yet. */
  blocking: string[];
  /** Things to fix before it goes into the game. */
  warnings: string[];
}

export function checkLevel(level: Level): LevelCheck {
  const paths = level.paths.map((p) => buildPath(p.points));
  const r = SPOT_RULES;
  const spots = level.pads.map(([x, y], i): LevelCheck['spots'][number] => {
    if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) return 'edge';
    if (paths.some((p) => distanceToPath(p, x, y) < r.roadGap)) return 'road';
    if (level.pads.some(([ox, oy], j) => j !== i && Math.hypot(ox - x, oy - y) < r.spotGap)) return 'crowded';
    return 'ok';
  });
  const blocking: string[] = [];
  if (!level.paths.length) blocking.push('Draw at least one road.');
  if (!level.waves.some((w) => w.groups.length)) blocking.push('Add at least one wave.');
  const warnings: string[] = [];
  const red = spots.filter((s) => s !== 'ok').length;
  if (red) warnings.push(`${red} stone spot${red > 1 ? 's are' : ' is'} red: too close to a road, another spot or the edge.`);
  if (level.pads.length < 4) warnings.push('Fewer than 4 stone spots.');
  return { spots, blocking, warnings };
}

/** The level as it would sit in data/levels.json. */
export function levelToJson(level: Level): string {
  const id = level.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-level';
  const pts = (p: Point[]) => `[${p.map(([x, y]) => `[${x}, ${y}]`).join(', ')}]`;
  const group = (g: WaveGroup) =>
    `{ ${Object.entries(g).filter(([, v]) => v !== undefined).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ')} }`;
  return [
    '{',
    `  "id": ${JSON.stringify(id)},`,
    `  "name": ${JSON.stringify(level.name)},`,
    `  "startGold": ${level.startGold ?? BALANCE.rules.startGold},`,
    '  "paths": [',
    level.paths.map((p) => `    { "points": ${pts(p.points)} }`).join(',\n'),
    '  ],',
    `  "pads": ${pts(level.pads)},`,
    '  "waves": [',
    level.waves.filter((w) => w.groups.length).map((w) => `    { "groups": [${w.groups.map(group).join(', ')}] }`).join(',\n'),
    '  ]',
    '}',
  ].join('\n');
}

function loadDraft(): Level | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return d && Array.isArray(d.paths) && Array.isArray(d.pads) && Array.isArray(d.waves) ? d : null;
  } catch {
    return null;
  }
}

export class Studio {
  active = false;
  private draft: Level = loadDraft() ?? blankLevel();
  private history: string[] = [];
  private tool: Tool = 'road';
  private stroke: Point[] | null = null;
  private down: { x: number; y: number } | null = null;
  private game: Game | null = null;
  private renderer: Renderer | null = null;
  private check: LevelCheck = checkLevel(this.draft);
  private bar: HTMLDivElement;
  private hint: HTMLDivElement;

  constructor(private host: StudioHost) {
    this.bar = document.createElement('div');
    this.bar.id = 'studioBar';
    this.bar.hidden = true;
    this.bar.innerHTML = `
      <div class="tools">
        <button class="pill" data-tool="road">✏️ Road</button>
        <button class="pill" data-tool="spots">🪨 Spots</button>
        <button class="pill" data-act="undo">↩️ Undo</button>
        <button class="pill" data-act="level">🌊 Waves</button>
        <button class="pill" data-act="test">▶️ Test</button>
        <button class="pill" data-act="copy">📋 Copy</button>
        <button class="pill" data-act="exit">✕</button>
      </div>
      <div class="hint pill"></div>`;
    document.body.append(this.bar);
    this.hint = this.bar.querySelector('.hint')!;
    this.bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => this.setTool(b.dataset.tool as Tool)));
    const acts: Record<string, () => void> = {
      undo: () => this.undo(),
      level: () => this.showLevelCard(),
      test: () => this.test(),
      copy: () => this.copy(),
      exit: () => host.onExit(),
    };
    this.bar.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => (b.onclick = () => acts[b.dataset.act!]()));

    const c = host.canvas;
    c.addEventListener('pointerdown', (e) => this.pointerDown(e));
    c.addEventListener('pointermove', (e) => this.pointerMove(e));
    c.addEventListener('pointerup', (e) => this.pointerUp(e));
    c.addEventListener('pointercancel', () => {
      this.stroke = null;
      this.down = null;
    });
  }

  open(): void {
    this.active = true;
    document.body.classList.add('studio');
    this.bar.hidden = false;
    this.host.hideCard();
    this.rebuild();
    this.setTool(this.draft.paths.length ? 'spots' : 'road');
  }

  close(): void {
    this.active = false;
    document.body.classList.remove('studio');
    this.bar.hidden = true;
  }

  draw(): void {
    const v = this.host.view();
    const ctx = this.host.ctx;
    if (this.game && this.renderer) {
      this.renderer.draw(this.game, v, 0, { selected: null, placingFlag: false, preview: null, drag: null, heroSelected: false, heroDrag: null, armedSpecial: null });
    } else {
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.fillStyle = '#5b8a3c';
      ctx.fillRect(0, 0, v.width, v.height);
    }
    ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);
    // The map's edge, so it's clear where roads should start and end.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
    ctx.setLineDash([]);
    // Without roads the game can't be drawn yet: show the spots plainly.
    if (!this.game) {
      for (const [x, y] of this.draft.pads) {
        ctx.fillStyle = '#b5b1a8';
        ctx.beginPath();
        ctx.ellipse(x, y, 38, 22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Red rings on spots that break the rules.
    this.check.spots.forEach((s, i) => {
      if (s === 'ok') return;
      const [x, y] = this.draft.pads[i];
      ctx.strokeStyle = '#e0533d';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x, y, 46, 28, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Where each road starts: a green arrow pointing the way enemies walk.
    for (const p of this.game?.paths ?? []) {
      const a = p.samples.find((s) => s.x > 20 && s.x < WORLD_W - 20 && s.y > 20 && s.y < WORLD_H - 20) ?? p.samples[0];
      const b = p.samples[Math.min(p.samples.length - 1, p.samples.indexOf(a) + 8)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#5fae4a';
      ctx.strokeStyle = '#1d3d14';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(-10, -18);
      ctx.lineTo(-10, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // The road being drawn right now.
    if (this.stroke && this.stroke.length > 1) {
      ctx.strokeStyle = 'rgba(255, 213, 74, 0.9)';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }

  // ---- Editing ----

  private setTool(t: Tool): void {
    this.tool = t;
    this.bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    this.setHint();
  }

  private setHint(extra = ''): void {
    const base = this.tool === 'road'
      ? `Draw a road from where enemies come in to where they leave (start and end at the map's edge). Tap a road to remove it. ${this.draft.paths.length}/${MAX_ROADS} roads.`
      : 'Tap to add a stone spot, tap a spot to remove it. Red spots are too close to a road, another spot or the edge.';
    this.hint.textContent = extra || base;
  }

  /** Saves the current draft for Undo, then applies a change, rebuilds and stores the draft. */
  private change(apply: () => void): void {
    this.history.push(JSON.stringify(this.draft));
    if (this.history.length > 40) this.history.shift();
    apply();
    this.saved();
  }

  private saved(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.draft));
    } catch {
      // Not saved; the draft stays until the page closes.
    }
    this.rebuild();
    this.setHint();
  }

  private undo(): void {
    const prev = this.history.pop();
    if (!prev) return this.setHint('Nothing to undo.');
    this.draft = JSON.parse(prev);
    this.saved();
  }

  private rebuild(): void {
    this.check = checkLevel(this.draft);
    if (this.draft.paths.length) {
      this.game = new Game({ ...this.draft, waves: [] }, BALANCE);
      this.renderer = new Renderer(this.host.ctx, this.game);
    } else {
      this.game = null;
      this.renderer = null;
    }
  }

  private world(e: PointerEvent): Point {
    const w = toWorld(this.host.view(), e.clientX, e.clientY);
    return [w.x, w.y];
  }

  private pointerDown(e: PointerEvent): void {
    if (!this.active || !e.isPrimary) return;
    this.down = { x: e.clientX, y: e.clientY };
    if (this.tool === 'road') this.stroke = [this.world(e)];
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.active || !this.stroke || !e.isPrimary) return;
    const p = this.world(e);
    const last = this.stroke[this.stroke.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 10) this.stroke.push(p);
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.active || !this.down || !e.isPrimary) return;
    const tap = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 14;
    this.down = null;
    const [x, y] = this.world(e);
    if (this.tool === 'road') {
      const stroke = this.stroke;
      this.stroke = null;
      if (tap) return this.removeRoadAt(x, y);
      if (!stroke) return;
      const length = stroke.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - stroke[i][0], p[1] - stroke[i][1]), 0);
      if (length < 250) return this.setHint('That road is too short: draw a longer one.');
      if (this.draft.paths.length >= MAX_ROADS) return this.setHint(`At most ${MAX_ROADS} roads: tap one to remove it first.`);
      this.change(() => this.draft.paths.push({ points: strokeToRoad(stroke) }));
      return;
    }
    if (!tap) return;
    const near = this.draft.pads.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 45);
    if (near >= 0) this.change(() => this.draft.pads.splice(near, 1));
    else this.change(() => this.draft.pads.push([Math.round(x), Math.round(y)]));
  }

  private removeRoadAt(x: number, y: number): void {
    const paths = this.draft.paths.map((p) => buildPath(p.points));
    const i = paths.findIndex((p) => distanceToPath(p, x, y) < 45);
    if (i < 0) return this.setHint('Drag your finger to draw a road; tap a road to remove it.');
    this.change(() => {
      this.draft.paths.splice(i, 1);
      // Waves on removed or later roads move to a road that still exists.
      for (const w of this.draft.waves) {
        for (const g of w.groups) {
          if ((g.path ?? 0) === i) delete g.path;
          else if ((g.path ?? 0) > i) g.path = (g.path ?? 0) - 1;
        }
      }
    });
  }

  // ---- Test and copy ----

  private test(): void {
    const c = checkLevel(this.draft);
    if (c.blocking.length) return this.setHint(c.blocking.join(' '));
    this.host.onTest(structuredClone({ ...this.draft, id: 'studio-test' }));
  }

  private copy(): void {
    const c = checkLevel(this.draft);
    if (c.blocking.length) return this.setHint(c.blocking.join(' '));
    const json = levelToJson(this.draft);
    const done = (ok: boolean) => {
      this.host.showCard(
        `<h2>${ok ? 'Copied!' : 'Copy this'}</h2>
         <p>${ok ? 'Paste it in the chat with Claude to add the level to the game.' : 'Select all the text below, copy it, and paste it in the chat with Claude.'}</p>
         ${c.warnings.length ? `<p class="warn">${c.warnings.join(' ')}</p>` : ''}
         <textarea class="json" readonly>${json.replace(/</g, '&lt;')}</textarea>`,
        [{ text: 'Back to the studio', main: true, onClick: () => this.host.hideCard() }],
      );
      const ta = this.host.card.querySelector('textarea')!;
      ta.onfocus = () => ta.select();
    };
    navigator.clipboard?.writeText(json).then(() => done(true), () => done(false)) ?? done(false);
  }

  // ---- Level settings and waves ----

  private showLevelCard(keepScroll = false): void {
    const top = this.host.card.scrollTop;
    const d = this.draft;
    const enemies = Object.entries(BALANCE.enemies);
    const roads = d.paths.length;
    const num = (field: string, v: number | undefined, step: number) =>
      `<input type="number" inputmode="decimal" step="${step}" min="0" data-f="${field}" value="${v ?? 0}">`;
    const waves = d.waves.map((w, wi) => `
      <div class="wave"><div class="waveHead"><b>Wave ${wi + 1}</b><button class="pill small" data-delwave="${wi}">✕</button></div>
        ${w.groups.map((g, gi) => `
          <div class="grp" data-w="${wi}" data-g="${gi}">
            <select data-f="enemy">${enemies.map(([k, e]) => `<option value="${k}" ${k === g.enemy ? 'selected' : ''}>${e.name}</option>`).join('')}</select>
            ${num('count', g.count, 1)}<span>× every</span>${num('interval', g.interval, 0.1)}<span>s, after</span>${num('delay', g.delay, 0.5)}<span>s</span>
            ${roads > 1 ? `<select data-f="path">${d.paths.map((_, i) => `<option value="${i}" ${(g.path ?? 0) === i ? 'selected' : ''}>road ${i + 1}</option>`).join('')}</select>` : ''}
            <button class="pill small" data-delgrp="${wi}:${gi}">✕</button>
          </div>`).join('')}
        <button class="pill small" data-addgrp="${wi}">+ enemies</button>
      </div>`).join('');
    this.host.showCard(
      `<h2>Level</h2>
       <div class="form">
         <label>Name <input type="text" id="stName" value="${d.name.replace(/"/g, '&quot;')}"></label>
         <label>Start gold <input type="number" inputmode="numeric" id="stGold" value="${d.startGold ?? BALANCE.rules.startGold}"></label>
       </div>
       <div class="waves">${waves}</div>
       <button class="pill small" id="stAddWave">+ wave</button>
       <p>Start over from:
         <button class="pill small" data-from="blank">Blank map</button>
         ${LEVELS.map((l, i) => `<button class="pill small" data-from="${i}">${l.name}</button>`).join('')}
         (Undo brings your draft back.)</p>`,
      [{ text: 'Done', main: true, onClick: () => this.host.hideCard() }],
    );
    const card = this.host.card;
    if (keepScroll) card.scrollTop = top;
    card.querySelector<HTMLInputElement>('#stName')!.onchange = (e) => this.change(() => (d.name = (e.target as HTMLInputElement).value.trim() || 'My level'));
    card.querySelector<HTMLInputElement>('#stGold')!.onchange = (e) => this.change(() => (d.startGold = Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0))));
    card.querySelectorAll<HTMLElement>('.grp').forEach((row) => {
      const g = d.waves[Number(row.dataset.w)].groups[Number(row.dataset.g)];
      row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-f]').forEach((el) => {
        el.onchange = () =>
          this.change(() => {
            const f = el.dataset.f!;
            if (f === 'enemy') g.enemy = el.value;
            else if (f === 'path') g.path = Number(el.value) || undefined;
            else if (f === 'count') g.count = Math.max(1, Math.round(Number(el.value) || 1));
            else if (f === 'interval') g.interval = Math.max(0.1, Number(el.value) || 0.1);
            else if (f === 'delay') g.delay = Math.max(0, Number(el.value) || 0) || undefined;
          });
      });
    });
    const again = () => this.showLevelCard(true);
    card.querySelectorAll<HTMLButtonElement>('[data-delwave]').forEach((b) => (b.onclick = () => (this.change(() => d.waves.splice(Number(b.dataset.delwave), 1)), again())));
    card.querySelectorAll<HTMLButtonElement>('[data-delgrp]').forEach((b) => {
      b.onclick = () => {
        const [wi, gi] = b.dataset.delgrp!.split(':').map(Number);
        this.change(() => d.waves[wi].groups.splice(gi, 1));
        again();
      };
    });
    card.querySelectorAll<HTMLButtonElement>('[data-addgrp]').forEach((b) => {
      b.onclick = () => (this.change(() => d.waves[Number(b.dataset.addgrp)].groups.push({ enemy: 'kobold', count: 6, interval: 1 })), again());
    });
    card.querySelector<HTMLButtonElement>('#stAddWave')!.onclick = () => (this.change(() => d.waves.push({ groups: [{ enemy: 'kobold', count: 8, interval: 1 }] })), again());
    card.querySelectorAll<HTMLButtonElement>('[data-from]').forEach((b) => {
      b.onclick = () => {
        const from = b.dataset.from!;
        this.change(() => {
          this.draft = from === 'blank' ? blankLevel() : { ...structuredClone(LEVELS[Number(from)]), name: `${LEVELS[Number(from)].name} (copy)` };
        });
        this.host.hideCard();
        this.setTool(this.draft.paths.length ? 'spots' : 'road');
      };
    });
  }
}
