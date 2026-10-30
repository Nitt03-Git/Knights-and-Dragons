// Fonts are bundled with the game, so it loads nothing from other sites.
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import { BALANCE, LEVELS } from './data';
import { fitView, panView, Renderer, toScreen, toWorld, zoomView, type Overlay, type View } from './render';
import { Game, STEP } from './sim';

const VERSION = '0.4';

/** Towers in the build ring, clockwise from top-left. */
const BUILD_RING: { type: string; icon: string; label: string; angle: number; soon?: string }[] = [
  { type: 'archer', icon: '🏹', label: 'Bowmen', angle: -135 },
  { type: 'knights', icon: '🛡️', label: 'Knights', angle: -45 },
  { type: 'catapult', icon: '🪨', label: 'Catapult', angle: 45 },
  { type: 'wizard', icon: '🔮', label: 'Wizard', angle: 135 },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const ui = {
  lives: $('lives'),
  gold: $('gold'),
  wave: $('wave'),
  speed: $<HTMLButtonElement>('speed'),
  pause: $<HTMLButtonElement>('pause'),
  callWave: $<HTMLButtonElement>('callWave'),
  menu: $('menu'),
  banner: $('banner'),
  overlay: $('overlay'),
  card: $('card'),
  version: $('version'),
};

const level = LEVELS[0];
let game = new Game(level, BALANCE);
let renderer = new Renderer(ctx, game);
/** The whole map on screen, and the current (possibly zoomed and moved) view. */
let fitted: View = fitView(1, 1, 1);
let view: View = fitted;
let speed = 1;
let paused = true;
let selected: number | null = null;
/** Pad of the hall whose flag the player is moving, if any. */
let placingFlag: number | null = null;
let shownEnd = false;
let bannerTimer = 0;

ui.version.textContent = `v${VERSION} · build ${__BUILD__}`;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  fitted = fitView(w, h, dpr);
  view = fitted;
  closeMenu();
}
window.addEventListener('resize', resize);
resize();

// ---- Screens ----

function showCard(html: string, buttons: { text: string; main?: boolean; onClick: () => void }[]): void {
  ui.card.innerHTML = html + '<div class="buttons"></div>';
  const row = ui.card.querySelector('.buttons')!;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'pill' + (b.main ? ' main' : '');
    el.textContent = b.text;
    el.onclick = b.onClick;
    row.append(el);
  }
  ui.overlay.hidden = false;
}

function hideCard(): void {
  ui.overlay.hidden = true;
}

function showStart(): void {
  showCard(
    `<h1>Knights &amp; Dragons</h1>
     <p>The dragon's horde is coming down <b>${level.name}</b>.</p>
     <p>Tap a stone spot to build. Bowmen shoot; knights hold the road. Pinch to zoom.</p>
     <p>Tap <b>⚔ Start</b> when you're ready.</p>`,
    [{ text: 'Play', main: true, onClick: () => { goFullscreen(); hideCard(); paused = false; } }],
  );
}

function showPause(): void {
  paused = true;
  showCard('<h2>Paused</h2>', [
    { text: 'Restart', onClick: restart },
    { text: 'Resume', main: true, onClick: () => { hideCard(); paused = false; } },
  ]);
}

function showEnd(): void {
  closeMenu();
  ui.banner.hidden = true;
  const won = game.phase === 'won';
  const stars = game.stars();
  const starRow = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('');
  showCard(
    won
      ? `<h2>Victory!</h2><div class="stars">${starRow}</div><p>${level.name} is safe, with ${game.lives} lives left.</p>`
      : `<h2>Defeat</h2><p>The horde broke through on wave ${game.wavesStarted} of ${game.totalWaves}.</p>`,
    [{ text: 'Play again', main: true, onClick: restart }],
  );
}

function restart(): void {
  game = new Game(level, BALANCE);
  renderer = new Renderer(ctx, game);
  selected = null;
  shownEnd = false;
  closeMenu();
  hideCard();
  paused = false;
}

function goFullscreen(): void {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {});
  }
}

function showBanner(html: string, seconds = 2): void {
  ui.banner.innerHTML = html;
  ui.banner.hidden = false;
  bannerTimer = seconds;
}

function hideBanner(): void {
  ui.banner.hidden = true;
  bannerTimer = 0;
}

// ---- Build / upgrade ring ----

interface RingSpec {
  angle: number;
  /** Actions with a key need a second tap: the first one arms the button (and shows `preview`). */
  key?: string;
  html: (armed: boolean) => string;
  act: () => void;
  preview?: Overlay['preview'];
  state?: (el: HTMLButtonElement) => void;
}
let ring: (() => void)[] = [];
/** The ring button waiting for its confirming tap, and the range preview it shows. */
let armed: string | null = null;
let preview: Overlay['preview'] = null;

function closeMenu(): void {
  if (placingFlag !== null) hideBanner();
  placingFlag = null;
  selected = null;
  armed = null;
  preview = null;
  ui.menu.hidden = true;
  ui.menu.innerHTML = '';
  ring = [];
}

function ringButton(spec: RingSpec): void {
  const el = document.createElement('button');
  const r = 66;
  el.style.left = `${Math.cos((spec.angle * Math.PI) / 180) * r}px`;
  el.style.top = `${Math.sin((spec.angle * Math.PI) / 180) * r}px`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!spec.key || armed === spec.key) {
      spec.act();
    } else {
      armed = spec.key;
      preview = spec.preview ?? null;
    }
  });
  const update = () => {
    const isArmed = !!spec.key && armed === spec.key;
    const html = spec.html(isArmed);
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('armed', isArmed);
    spec.state?.(el);
  };
  ui.menu.append(el);
  ring.push(update);
}

const face = (icon: string, label: string, price = '') =>
  `<span class="icon">${icon}</span><span class="label">${label}</span>${price ? `<span class="price">${price}</span>` : ''}`;

function openMenu(pad: number): void {
  closeMenu();
  selected = pad;
  const p = toScreen(view, game.pads[pad].x, game.pads[pad].y);
  const margin = 100;
  ui.menu.style.left = `${Math.min(view.width - margin, Math.max(margin, p.x))}px`;
  ui.menu.style.top = `${Math.min(view.height - margin, Math.max(margin, p.y))}px`;
  const tower = game.towers[pad];
  if (!tower) {
    for (const b of BUILD_RING) {
      if (b.soon) {
        ringButton({ angle: b.angle, html: () => face(b.icon, b.label, '') + `<span class="label">in ${b.soon}</span>`, act: () => {}, state: (el) => el.classList.add('locked') });
        continue;
      }
      const cost = game.towerLevel(b.type, 0)!.cost;
      ringButton({
        angle: b.angle,
        key: `build:${b.type}`,
        html: (on) => face(on ? '✔️' : b.icon, on ? 'Build' : b.label, String(cost)),
        act: () => game.build(pad, b.type) && closeMenu(),
        preview: { pad, type: b.type, level: 0 },
        state: (el) => el.classList.toggle('cant', game.gold < cost),
      });
    }
  } else {
    const cost = game.upgradeCost(pad);
    ringButton({
      angle: -90,
      key: cost === null ? undefined : 'upgrade',
      html: (on) => (cost === null ? face('⭐', 'Max') : face(on ? '✔️' : '⬆️', on ? 'Upgrade' : `Level ${tower.level + 2}`, String(cost))),
      act: () => game.upgrade(pad) && openMenu(pad),
      preview: { pad, type: tower.type, level: tower.level + 1 },
      state: (el) => el.classList.toggle('cant', cost !== null && game.gold < cost),
    });
    if (tower.rally) {
      ringButton({ angle: 180, html: () => face('🚩', 'Move') + '<span class="label">flag</span>', act: () => startFlag(pad) });
    }
    ringButton({
      angle: 90,
      key: 'sell',
      html: (on) => face(on ? '✔️' : '💰', on ? 'Sure?' : 'Sell', `+${game.sellValue(pad)}`),
      act: () => game.sell(pad) && closeMenu(),
      state: (el) => el.classList.add('sell'),
    });
  }
  ui.menu.hidden = false;
  for (const update of ring) update();
}

function startFlag(pad: number): void {
  closeMenu();
  selected = pad;
  placingFlag = pad;
  showBanner('Tap the road<small>inside the blue circle</small>', Infinity);
}

/** A tap while moving a flag: on the road moves it; far outside the circle cancels. */
function placeFlag(x: number, y: number): void {
  const pad = placingFlag!;
  const t = game.towers[pad];
  const range = t ? game.towerLevel(t.type, t.level)!.range : 0;
  const p = game.pads[pad];
  if (game.setRally(pad, x, y) || Math.hypot(x - p.x, y - p.y) > range + 60) closeMenu();
  else showBanner('Tap the road<small>inside the blue circle</small>', Infinity);
}

// ---- Input: tap, drag knights, pan, pinch to zoom ----

const playing = () => !paused && !game.isOver();

/** The pad whose tower is under a tap (towers stand up from their pad, so the body counts too). */
function padAt(x: number, y: number): { pad: number; dist: number } | null {
  // Generous hit area: at least 24 screen pixels, even when zoomed out.
  let best: { pad: number; dist: number } | null = null;
  game.pads.forEach((p, i) => {
    const dist = Math.min(Math.hypot(p.x - x, p.y - y), game.towers[i] ? Math.hypot(p.x - x, p.y - 45 - y) : Infinity);
    if (dist < Math.max(55, 24 / view.scale) && (!best || dist < best.dist)) best = { pad: i, dist };
  });
  return best;
}

/** The hall whose knights or flag are under a finger. */
function hallAt(x: number, y: number): { pad: number; dist: number } | null {
  let best: { pad: number; dist: number } | null = null;
  const reach = Math.max(30, 22 / view.scale);
  game.towers.forEach((t, i) => {
    if (!t?.rally) return;
    const spots = [{ x: t.rally.x, y: t.rally.y - 15 }, ...t.knights.filter((k) => k.state !== 'dead').map((k) => ({ x: k.x, y: k.y - 14 }))];
    for (const s of spots) {
      const dist = Math.hypot(s.x - x, s.y - y);
      if (dist < reach && (!best || dist < best.dist)) best = { pad: i, dist };
    }
  });
  return best;
}

function handleTap(sx: number, sy: number): void {
  if (!playing()) return;
  const w = toWorld(view, sx, sy);
  if (placingFlag !== null) return placeFlag(w.x, w.y);
  const pad = padAt(w.x, w.y);
  const hall = hallAt(w.x, w.y);
  const hit = pad && (!hall || pad.dist <= hall.dist) ? pad.pad : hall?.pad ?? null;
  if (hit !== null && hit !== selected) openMenu(hit);
  else closeMenu();
}

type Gesture =
  | { kind: 'tap'; x: number; y: number; hall: number | null }
  | { kind: 'pan' }
  | { kind: 'pinch'; dist: number; mx: number; my: number }
  | { kind: 'flag'; pad: number };
const pointers = new Map<number, { x: number; y: number }>();
let gesture: Gesture | null = null;
let drag: Overlay['drag'] = null;

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

function dragFlagTo(pad: number, sx: number, sy: number): void {
  const w = toWorld(view, sx, sy);
  const snap = game.rallyFor(pad, w.x, w.y);
  drag = { pad, x: w.x, y: w.y, snap: snap && { x: snap.x, y: snap.y } };
}

canvas.addEventListener('pointerdown', (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Not every pointer can be captured (e.g. synthetic ones); moves still arrive.
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    drag = null;
    if (placingFlag === null) closeMenu();
    gesture = { kind: 'pinch', ...pinchState() };
  } else if (pointers.size === 1) {
    const w = toWorld(view, e.clientX, e.clientY);
    const hall = playing() && placingFlag === null ? hallAt(w.x, w.y) : null;
    gesture = { kind: 'tap', x: e.clientX, y: e.clientY, hall: hall?.pad ?? null };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  switch (gesture.kind) {
    case 'tap': {
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 12) return;
      if (gesture.hall !== null) {
        // Dragging knights (or their flag) moves the flag.
        const pad = gesture.hall;
        closeMenu();
        gesture = { kind: 'flag', pad };
        dragFlagTo(pad, e.clientX, e.clientY);
      } else {
        if (placingFlag === null) closeMenu();
        view = panView(view, e.clientX - gesture.x, e.clientY - gesture.y);
        gesture = { kind: 'pan' };
      }
      break;
    }
    case 'pan':
      view = panView(view, dx, dy);
      break;
    case 'pinch': {
      const n = pinchState();
      view = zoomView(view, fitted, n.dist / gesture.dist, n.mx, n.my);
      view = panView(view, n.mx - gesture.mx, n.my - gesture.my);
      gesture = { kind: 'pinch', ...n };
      break;
    }
    case 'flag':
      dragFlagTo(gesture.pad, e.clientX, e.clientY);
      break;
  }
});

function pointerEnd(e: PointerEvent): void {
  if (!pointers.delete(e.pointerId) || !gesture) return;
  if (gesture.kind === 'tap' && e.type === 'pointerup') handleTap(e.clientX, e.clientY);
  if (gesture.kind === 'flag') {
    if (drag?.snap && playing()) game.setRally(gesture.pad, drag.snap.x, drag.snap.y);
    drag = null;
  }
  // Lifting one finger of a pinch carries on as a pan with the other.
  gesture = pointers.size === 0 ? null : gesture.kind === 'pinch' ? { kind: 'pan' } : gesture;
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (placingFlag === null) closeMenu();
    view = zoomView(view, fitted, Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  },
  { passive: false },
);

ui.pause.onclick = () => (paused ? (hideCard(), (paused = false)) : showPause());
ui.speed.onclick = () => {
  speed = speed === 1 ? 2 : 1;
  ui.speed.textContent = `${speed}×`;
};
ui.callWave.onclick = () => {
  if (!paused) game.callWave();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && !game.isOver()) showPause();
});

// ---- Loop ----

function updateHud(): void {
  ui.lives.textContent = String(game.lives);
  ui.gold.textContent = String(game.gold);
  ui.wave.textContent = `${game.wavesStarted}/${game.totalWaves}`;
  const canCall = game.canCallWave();
  ui.callWave.hidden = !canCall;
  if (canCall) {
    const next = game.wavesStarted + 1;
    const html = game.wavesStarted === 0
      ? `⚔ Start wave 1`
      : `⚔ Call wave ${next}<small>in ${Math.ceil(game.nextWaveIn ?? 0)}s · +${game.earlyBonus()} 🪙</small>`;
    if (ui.callWave.innerHTML !== html) ui.callWave.innerHTML = html;
    ui.callWave.classList.toggle('first', game.wavesStarted === 0);
  }
  for (const update of ring) update();
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt * speed;
    while (acc >= STEP) {
      game.step(STEP);
      acc -= STEP;
    }
  }
  for (const ev of game.events) {
    if (ev.kind === 'wave') {
      showBanner(`Wave ${ev.wave} of ${game.totalWaves}${ev.bonus ? `<small>+${ev.bonus} gold for calling early</small>` : ''}`);
    }
  }
  renderer.draw(game, view, paused ? 0 : dt * speed, { selected, placingFlag: placingFlag !== null, preview, drag });
  game.events.length = 0;
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) ui.banner.hidden = true;
  updateHud();
  if (game.isOver() && !shownEnd) {
    shownEnd = true;
    setTimeout(showEnd, 700);
  }
  requestAnimationFrame(frame);
}

if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { debug: { get game() { return game; }, get view() { return view; }, setPaused: (p: boolean) => (paused = p) } });
}

showStart();
requestAnimationFrame(frame);
