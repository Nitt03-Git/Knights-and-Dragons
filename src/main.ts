// Fonts are bundled with the game, so it loads nothing from other sites.
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import { BALANCE, LEVELS } from './data';
import { fitView, Renderer, toScreen, toWorld, type View } from './render';
import { Game, STEP } from './sim';

const VERSION = '0.2';

/** Towers in the build ring, clockwise from top-left. Locked ones arrive in later versions. */
const BUILD_RING: { type: string; icon: string; label: string; angle: number; soon?: string }[] = [
  { type: 'archer', icon: '🏹', label: 'Bowmen', angle: -135 },
  { type: 'knights', icon: '🛡️', label: 'Knights', angle: -45, soon: '0.3' },
  { type: 'catapult', icon: '🪨', label: 'Catapult', angle: 45, soon: '0.4' },
  { type: 'wizard', icon: '🔮', label: 'Wizard', angle: 135, soon: '0.4' },
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
let view: View = fitView(1, 1, 1);
let speed = 1;
let paused = true;
let selected: number | null = null;
let shownEnd = false;
let bannerTimer = 0;

ui.version.textContent = `v${VERSION} · build ${__BUILD__}`;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  view = fitView(w, h, dpr);
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
     <p>Tap a stone spot to build a tower. Tap <b>⚔ Start</b> when you're ready.</p>`,
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

function showBanner(html: string): void {
  ui.banner.innerHTML = html;
  ui.banner.hidden = false;
  bannerTimer = 2;
}

// ---- Build / upgrade ring ----

interface RingButton {
  el: HTMLButtonElement;
  update: () => void;
}
let ring: RingButton[] = [];

function closeMenu(): void {
  selected = null;
  ui.menu.hidden = true;
  ui.menu.innerHTML = '';
  ring = [];
}

function ringButton(angle: number, html: string, onClick: () => void, update: (el: HTMLButtonElement) => void = () => {}): void {
  const el = document.createElement('button');
  const r = 66;
  el.style.left = `${Math.cos((angle * Math.PI) / 180) * r}px`;
  el.style.top = `${Math.sin((angle * Math.PI) / 180) * r}px`;
  el.innerHTML = html;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  ui.menu.append(el);
  ring.push({ el, update: () => update(el) });
}

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
        ringButton(b.angle, `<span class="icon">${b.icon}</span><span class="label">${b.label}</span><span class="label">in ${b.soon}</span>`, () => {}, (el) => el.classList.add('locked'));
        continue;
      }
      const cost = game.towerLevel(b.type, 0)!.cost;
      ringButton(
        b.angle,
        `<span class="icon">${b.icon}</span><span class="label">${b.label}</span><span class="price">${cost}</span>`,
        () => game.build(pad, b.type) && closeMenu(),
        (el) => el.classList.toggle('cant', game.gold < cost),
      );
    }
  } else {
    ringButton(
      -90,
      '',
      () => game.upgrade(pad) && openMenu(pad),
      (el) => {
        const cost = game.upgradeCost(pad);
        const html = cost === null
          ? '<span class="icon">⭐</span><span class="label">Max</span>'
          : `<span class="icon">⬆️</span><span class="label">Level ${tower.level + 2}</span><span class="price">${cost}</span>`;
        if (el.innerHTML !== html) el.innerHTML = html;
        el.classList.toggle('cant', cost !== null && game.gold < cost);
      },
    );
    ringButton(90, `<span class="icon">💰</span><span class="label">Sell</span><span class="price">+${game.sellValue(pad)}</span>`, () => game.sell(pad) && closeMenu(), (el) => el.classList.add('sell'));
  }
  ui.menu.hidden = false;
  for (const b of ring) b.update();
}

// ---- Input ----

let down: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) return;
  down = null;
  if (paused || game.isOver()) return;
  const w = toWorld(view, e.clientX, e.clientY);
  // Generous hit area: at least 24 screen pixels, even on a small screen.
  const reach = Math.max(55, 24 / view.scale);
  let best = -1;
  let bestDist = reach;
  game.pads.forEach((p, i) => {
    // Towers stand up from their pad, so also accept taps on the tower body.
    const dist = Math.min(Math.hypot(p.x - w.x, p.y - w.y), game.towers[i] ? Math.hypot(p.x - w.x, p.y - 45 - w.y) : Infinity);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  if (best >= 0 && best !== selected) openMenu(best);
  else closeMenu();
});

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
  for (const b of ring) b.update();
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
  renderer.draw(game, view, paused ? 0 : dt * speed, selected);
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
  Object.assign(window, { debug: { get game() { return game; }, setPaused: (p: boolean) => (paused = p) } });
}

showStart();
requestAnimationFrame(frame);
