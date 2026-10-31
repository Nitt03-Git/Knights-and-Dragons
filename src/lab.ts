// Look Lab: every unit and tower animating side by side, with sliders and colours to change how
// they look. Changes are kept on the phone and used by the game there; Copy gives the looks as
// JSON to paste in the chat (Claude then puts them in data/looks.json for everyone).
import { BALANCE } from './data';
import { changesToJson, COLOR_NAMES, DEFAULT_LOOKS, LOOK_NAMES, LOOK_SLIDERS, LOOKS, lookChanges, resetLooks, setLookColor, setLookNumber, sliderLabel, type SliderKey } from './looks';
import { drawEnemy, drawHero, drawKnight, drawTower } from './render';
import type { Enemy, Hero, Knight } from './sim';

export type Pose = 'walk' | 'fight' | 'hurt' | 'still';

export interface LabHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Screen size in CSS pixels, and device pixels per CSS pixel. */
  screen: () => { width: number; height: number; dpr: number };
  showCard: (html: string, buttons: { text: string; main?: boolean; onClick: () => void }[]) => void;
  hideCard: () => void;
  card: HTMLElement;
  onExit: () => void;
}

/** Where each unit stands on the stage (stage units, feet position), and roughly how tall it is. */
const STAGE_W = 640;
const STAGE_H = 440;
export const SPOTS: Record<string, { x: number; y: number; h: number }> = {
  archer: { x: 90, y: 170, h: 120 },
  knights: { x: 240, y: 170, h: 100 },
  wizard: { x: 390, y: 170, h: 150 },
  catapult: { x: 540, y: 170, h: 80 },
  knight: { x: 120, y: 295, h: 45 },
  soldier: { x: 230, y: 295, h: 45 },
  hero: { x: 410, y: 295, h: 80 },
  kobold: { x: 70, y: 415, h: 32 },
  brute: { x: 185, y: 415, h: 42 },
  troll: { x: 310, y: 415, h: 60 },
  hexling: { x: 435, y: 415, h: 45 },
  wyrmling: { x: 560, y: 415, h: 80 },
};
const TOWERS = ['archer', 'knights', 'wizard', 'catapult'];

export class Lab {
  active = false;
  private selected = 'knight';
  private pose: Pose = 'walk';
  private towerLevel = 0;
  private closeUp = false;
  private time = 0;
  private bar: HTMLDivElement;
  private panel: HTMLDivElement;

  constructor(private host: LabHost) {
    this.bar = document.createElement('div');
    this.bar.id = 'labBar';
    this.bar.hidden = true;
    this.bar.innerHTML = `
      <button class="pill" data-act="close">🔍 Close-up</button>
      <button class="pill" data-act="copy">📋 Copy</button>
      <button class="pill" data-act="resetAll">↺ All</button>
      <button class="pill" data-act="exit">✕</button>`;
    this.panel = document.createElement('div');
    this.panel.id = 'labPanel';
    this.panel.hidden = true;
    document.body.append(this.bar, this.panel);
    const acts: Record<string, () => void> = {
      close: () => {
        this.closeUp = !this.closeUp;
        this.bar.querySelector('[data-act="close"]')!.classList.toggle('on', this.closeUp);
      },
      copy: () => this.copy(),
      resetAll: () => this.confirmResetAll(),
      exit: () => host.onExit(),
    };
    this.bar.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => (b.onclick = () => acts[b.dataset.act!]()));
    host.canvas.addEventListener('pointerdown', (e) => this.tap(e));
  }

  open(): void {
    this.active = true;
    document.body.classList.add('lab');
    this.bar.hidden = false;
    this.panel.hidden = false;
    this.host.hideCard();
    this.renderPanel();
  }

  close(): void {
    this.active = false;
    document.body.classList.remove('lab');
    this.bar.hidden = true;
    this.panel.hidden = true;
  }

  select(id: string): void {
    if (!LOOKS[id]) return;
    this.selected = id;
    this.renderPanel();
  }

  // ---- Stage ----

  /** The part of the screen left of the panel, in CSS pixels. */
  private stage() {
    const s = this.host.screen();
    const right = this.panel.hidden ? s.width : this.panel.getBoundingClientRect().left;
    const top = this.bar.getBoundingClientRect().bottom + 4;
    return { ...s, x: 0, y: top, w: Math.max(100, right), h: Math.max(100, s.height - top) };
  }

  /** Stage units → screen: the whole line-up fitted into the stage, or one unit large. */
  private transform() {
    const st = this.stage();
    if (this.closeUp) {
      const spot = SPOTS[this.selected];
      const scale = Math.min((st.h * 0.62) / spot.h, st.w / 220, 4);
      return { scale, ox: st.x + st.w / 2 - spot.x * scale, oy: st.y + st.h * 0.85 - spot.y * scale, st };
    }
    const scale = Math.min(st.w / STAGE_W, st.h / STAGE_H);
    return { scale, ox: st.x + (st.w - STAGE_W * scale) / 2, oy: st.y + (st.h - STAGE_H * scale) / 2, st };
  }

  private tap(e: PointerEvent): void {
    if (!this.active || this.closeUp) return;
    const t = this.transform();
    const x = (e.clientX - t.ox) / t.scale;
    const y = (e.clientY - t.oy) / t.scale;
    let best: string | null = null;
    let bestD = 60;
    for (const [id, s] of Object.entries(SPOTS)) {
      const d = Math.hypot(x - s.x, y - (s.y - s.h / 2));
      if (d < bestD) {
        best = id;
        bestD = d;
      }
    }
    if (best) this.select(best);
  }

  draw(dt: number): void {
    this.time += dt;
    const { ctx } = this.host;
    const t = this.transform();
    const { dpr, width, height } = t.st;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#5b8a3c';
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(dpr * t.scale, 0, 0, dpr * t.scale, dpr * t.ox, dpr * t.oy);
    // A strip of road under each row, so units stand on something.
    ctx.fillStyle = '#d2b27a';
    for (const y of this.closeUp ? [SPOTS[this.selected].y] : [170, 295, 415]) {
      ctx.beginPath();
      ctx.ellipse(this.closeUp ? SPOTS[this.selected].x : STAGE_W / 2, y + 2, this.closeUp ? 140 : STAGE_W / 2, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const ids = this.closeUp ? [this.selected] : Object.keys(SPOTS);
    if (!this.closeUp) {
      // The one being changed: a gold ring at its feet.
      const s = SPOTS[this.selected];
      ctx.strokeStyle = 'rgba(255, 213, 74, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, TOWERS.includes(this.selected) ? 52 : 34, TOWERS.includes(this.selected) ? 22 : 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const id of ids) this.drawUnit(id);
  }

  private drawUnit(id: string): void {
    const { ctx } = this.host;
    const { x, y } = SPOTS[id];
    const time = this.time;
    const pose = this.pose;
    // Hurt: a flash every 0.6 s and a part-empty health bar.
    const hitAge = pose === 'hurt' ? time % 0.6 : 9;
    if (TOWERS.includes(id)) {
      const cooldown = BALANCE.towers[id]?.levels[this.towerLevel]?.cooldown ?? 1;
      // Fight: the tower shoots every `cooldown` seconds, as in the game.
      const shotAge = pose === 'fight' ? time % Math.max(0.4, cooldown) : 9;
      drawTower(ctx, { type: id, level: this.towerLevel, shotAge }, x, y, cooldown);
      return;
    }
    const state = pose === 'walk' ? 'walking' : pose === 'fight' ? 'fighting' : 'idle';
    if (id === 'knight' || id === 'soldier') {
      const maxHp = 100;
      const k = { id: id === 'knight' ? 1 : 2, x, y, hp: pose === 'hurt' ? 60 : maxHp, state, hitAge } as unknown as Knight;
      drawKnight(ctx, k, maxHp, time, false, id);
      return;
    }
    if (id === 'hero') {
      const h = { x, y, hp: pose === 'hurt' ? 150 : 240, state, hitAge } as unknown as Hero;
      drawHero(ctx, h, 240, time, 1);
      return;
    }
    const spec = BALANCE.enemies[id];
    if (!spec) return;
    // Walking in place: the step pattern follows distance, as on the road.
    const d = 1000 + (pose === 'walk' || spec.flying ? time * spec.speed : 0);
    const e = { type: id, spec, x, y, d, hp: pose === 'hurt' ? spec.hp * 0.6 : spec.hp, hitAge } as unknown as Enemy;
    drawEnemy(ctx, e, 1e9);
  }

  // ---- Panel ----

  private renderPanel(): void {
    const id = this.selected;
    const look = LOOKS[id];
    const isTower = TOWERS.includes(id);
    const changed = !!lookChanges({ [id]: look })[id];
    const edited = lookChanges(LOOKS);
    // Units with changes get a pencil in the list.
    const options = Object.keys(LOOKS).map((k) => `<option value="${k}" ${k === id ? 'selected' : ''}>${LOOK_NAMES[k] ?? k}${edited[k] ? ' ✏️' : ''}</option>`).join('');
    const poses: [Pose, string][] = [['walk', isTower ? 'Idle' : 'Walk'], ['fight', isTower ? 'Shoot' : 'Fight'], ['hurt', 'Hurt'], ['still', 'Still']];
    const poseRow = (isTower ? poses.filter(([p]) => p !== 'walk' && p !== 'hurt') : poses)
      .map(([p, label]) => `<button class="pill small${this.pose === p || (isTower && this.pose !== 'fight' && p === 'still') ? ' on' : ''}" data-pose="${p}">${label}</button>`).join('');
    const levelRow = isTower
      ? `<div class="row"><span class="lbl">Level</span>${[0, 1, 2].map((l) => `<button class="pill small${this.towerLevel === l ? ' on' : ''}" data-level="${l}">${l + 1}</button>`).join('')}</div>`
      : '';
    const sliders = (Object.keys(LOOK_SLIDERS) as SliderKey[])
      .filter((k) => look[k] !== undefined)
      .map((k) => {
        const r = LOOK_SLIDERS[k];
        const v = look[k]!;
        const mark = v !== DEFAULT_LOOKS[id][k] ? ' changed' : '';
        return `<label class="slider${mark}"><span class="lbl">${sliderLabel(id, k)}</span>
          <input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" data-num="${k}">
          <span class="val">${v.toFixed(2)}×</span></label>`;
      }).join('');
    const colors = Object.entries(look.colors).map(([name, c]) => {
      const mark = c !== DEFAULT_LOOKS[id].colors[name] ? ' changed' : '';
      return `<label class="color${mark}"><input type="color" value="${c}" data-color="${name}"><span>${COLOR_NAMES[name] ?? name}</span></label>`;
    }).join('');
    this.panel.innerHTML = `
      <select class="unit">${options}</select>
      <div class="row poses">${poseRow}</div>
      ${levelRow}
      ${sliders}
      <div class="colors">${colors}</div>
      <button class="pill small reset" ${changed ? '' : 'disabled'}>↺ Back to the game's look</button>
      <p class="note">Changes show in the game on this phone. Tap 📋 Copy and paste it to Claude to make them everyone's.</p>`;
    const p = this.panel;
    p.querySelector<HTMLSelectElement>('select.unit')!.onchange = (e) => this.select((e.target as HTMLSelectElement).value);
    p.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach((b) => (b.onclick = () => {
      this.pose = b.dataset.pose as Pose;
      this.renderPanel();
    }));
    p.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => (b.onclick = () => {
      this.towerLevel = Number(b.dataset.level);
      this.renderPanel();
    }));
    p.querySelectorAll<HTMLInputElement>('[data-num]').forEach((inp) => {
      inp.oninput = () => {
        const key = inp.dataset.num as SliderKey;
        setLookNumber(id, key, Number(inp.value));
        const v = LOOKS[id][key]!;
        inp.parentElement!.querySelector('.val')!.textContent = `${v.toFixed(2)}×`;
        inp.parentElement!.classList.toggle('changed', v !== DEFAULT_LOOKS[id][key]);
        p.querySelector<HTMLButtonElement>('.reset')!.disabled = !lookChanges({ [id]: LOOKS[id] })[id];
      };
      // Let go: redraw the panel, so the unit list shows which ones are changed.
      inp.onchange = () => this.renderPanel();
    });
    p.querySelectorAll<HTMLInputElement>('[data-color]').forEach((inp) => {
      inp.oninput = () => {
        const name = inp.dataset.color!;
        setLookColor(id, name, inp.value);
        inp.parentElement!.classList.toggle('changed', LOOKS[id].colors[name] !== DEFAULT_LOOKS[id].colors[name]);
        p.querySelector<HTMLButtonElement>('.reset')!.disabled = !lookChanges({ [id]: LOOKS[id] })[id];
      };
      // Let go: redraw the panel, so the unit list shows which ones are changed.
      inp.onchange = () => this.renderPanel();
    });
    p.querySelector<HTMLButtonElement>('.reset')!.onclick = () => {
      resetLooks(id);
      this.renderPanel();
    };
  }

  // ---- Copy and reset ----

  private copy(): void {
    const changed = Object.keys(lookChanges(LOOKS)).map((k) => LOOK_NAMES[k] ?? k);
    if (!changed.length) {
      this.host.showCard(`<h2>Nothing changed yet</h2><p>Change a size, movement or colour first, then copy it.</p>`, [
        { text: 'Back to the Look Lab', main: true, onClick: () => this.host.hideCard() },
      ]);
      return;
    }
    const json = changesToJson();
    const done = (ok: boolean) => {
      this.host.showCard(
        `<h2>${ok ? 'Copied!' : 'Copy this'}</h2>
         <p>${ok ? 'Paste it in the chat with Claude to make these looks everyone\'s.' : 'Select all the text below, copy it, and paste it in the chat with Claude.'}</p>
         <p>Changed: ${changed.join(', ')}.</p>
         <textarea class="json" readonly>${json}</textarea>`,
        [{ text: 'Back to the Look Lab', main: true, onClick: () => this.host.hideCard() }],
      );
      const ta = this.host.card.querySelector('textarea')!;
      ta.onfocus = () => ta.select();
    };
    navigator.clipboard?.writeText(json).then(() => done(true), () => done(false)) ?? done(false);
  }

  private confirmResetAll(): void {
    this.host.showCard(
      `<h2>Back to the game's looks?</h2><p>This undoes every change in the Look Lab on this phone.</p>`,
      [
        { text: 'Keep my changes', onClick: () => this.host.hideCard() },
        {
          text: 'Reset all',
          main: true,
          onClick: () => {
            resetLooks();
            this.host.hideCard();
            this.renderPanel();
          },
        },
      ],
    );
  }
}
