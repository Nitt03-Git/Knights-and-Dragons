// The game rules. No drawing and no DOM here: the screen only reads this state and sends commands,
// so the same game can run in tests, at 2x speed, or behind any art style.
import { buildPath, pointAt, type Path } from './path';
import { makeRng } from './rng';
import type { Balance, DamageType, EnemySpec, HeroAbility, Level, SpecialKind, SpecialProgress, TowerLevel } from './types';

/** World size in units. Levels are drawn in this space and the screen scales it to fit. */
export const WORLD_W = 1600;
export const WORLD_H = 900;
export const STEP = 1 / 60;
/** Knights go after enemies this close to their flag. */
export const ENGAGE_RANGE = 95;
/** Extra distance at which a fighting knight also stops (and is hit by) other enemies. */
const HOLD_REACH = 24;
/** How close a tapped point must be to the road to move a flag there. */
export const FLAG_SNAP = 70;
/** How high flying enemies fly above the road (drawing and aiming only). */
export const FLY_HEIGHT = 45;
/** Where the knights of a hall stand across the road, around the flag. */
const POSTS: [number, number][] = [[0, -22], [-14, 0], [0, 22]];

export type Phase = 'ready' | 'playing' | 'won' | 'lost';

export interface Enemy {
  id: number;
  type: string;
  spec: EnemySpec;
  hp: number;
  path: number;
  d: number;
  lane: number;
  x: number;
  y: number;
  alive: boolean;
  /** The knight holding this enemy in place, if any. */
  heldBy: number | null;
  attackCooldown: number;
  /** Seconds since the last hit, for a short flash. */
  hitAge: number;
}

export type KnightState = 'idle' | 'walking' | 'fighting' | 'dead';

export interface Knight {
  id: number;
  /** Pad of the hall it belongs to; -1 for soldiers brought by Reinforcements. */
  pad: number;
  slot: number;
  x: number;
  y: number;
  hp: number;
  state: KnightState;
  /** The enemy this knight is hitting (one it holds, or one a fellow knight holds). */
  target: number | null;
  /** Enemies this knight holds in place, up to its unit's `holds`. */
  holding: number[];
  cooldown: number;
  respawnIn: number;
  hitAge: number;
}

export interface Hero {
  id: number;
  x: number;
  y: number;
  hp: number;
  state: KnightState;
  target: number | null;
  holding: number[];
  cooldown: number;
  respawnIn: number;
  hitAge: number;
  /** Where the hero stands guard, and where it is riding to after an order. */
  home: { x: number; y: number };
  dest: { x: number; y: number } | null;
  /** Seconds until the stomp is ready again, and since the last one (for drawing). */
  stompIn: number;
  stompAge: number;
  /** Experience earned so far (kept between battles), and the level it brought (1 = first). */
  xp: number;
  level: number;
}

/** A soldier brought by Reinforcements: fights like a knight, leaves after a while. */
export interface Soldier extends Knight {
  post: { x: number; y: number };
  leavesIn: number;
}

/** An Arrow Volley on its way down. */
export interface Strike {
  x: number;
  y: number;
  radius: number;
  damage: number;
  /** Seconds until the arrows land, and the total wait (for drawing). */
  left: number;
  delay: number;
}

/** What the player brings into a battle: hero abilities and XP, and how far each special is upgraded. */
export interface GameOptions {
  abilities?: HeroAbility[];
  heroXp?: number;
  specials?: Partial<Record<SpecialKind, SpecialProgress>>;
}

/** Anything that holds enemies in place and gets hit by them. */
type Holder = Knight | Hero;

export interface Rally {
  path: number;
  d: number;
  x: number;
  y: number;
}

export interface Tower {
  pad: number;
  type: string;
  level: number;
  cooldown: number;
  spent: number;
  /** Seconds since the last shot, for a small recoil. */
  shotAge: number;
  /** Halls only: where the knights stand, and the knights. */
  rally: Rally | null;
  knights: Knight[];
}

export interface Projectile {
  /** Arrows and bolts follow their target; shells fly to a spot on the ground and splash. */
  kind: 'arrow' | 'bolt' | 'shell';
  x: number;
  y: number;
  sx: number;
  sy: number;
  target: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  pierce: number;
  splash: number;
  /** Shells: share of the flight done (0..1) and its length in seconds. */
  t: number;
  flight: number;
  done: boolean;
}

export type GameEvent =
  | { kind: 'gold'; x: number; y: number; amount: number }
  | { kind: 'leak'; x: number; y: number; lives: number }
  | { kind: 'wave'; wave: number; bonus: number }
  | { kind: 'boom'; x: number; y: number; radius: number; stomp?: boolean }
  | { kind: 'levelUp'; x: number; y: number; level: number }
  | { kind: 'spear'; x: number; y: number; tx: number; ty: number };

interface Spawner {
  enemy: string;
  path: number;
  left: number;
  interval: number;
  timer: number;
}

/** Damage after armor (physical, minus the share `pierce` ignores) or magic resistance (magic). */
export function damageAfterDefence(amount: number, type: DamageType, spec: { armor: number; magicResist?: number }, pierce = 0): number {
  const block = type === 'physical' ? spec.armor * (1 - pierce) : (spec.magicResist ?? 0);
  return amount * (1 - block);
}

export class Game {
  readonly paths: Path[];
  readonly pads: { x: number; y: number }[];
  readonly totalWaves: number;

  phase: Phase = 'ready';
  time = 0;
  gold: number;
  lives: number;
  /** Waves started so far (the one on screen is wave number `wavesStarted`). */
  wavesStarted = 0;
  /** Seconds until the next wave starts by itself; null while a wave is still spawning or before wave 1. */
  nextWaveIn: number | null = null;

  enemies: Enemy[] = [];
  towers: (Tower | null)[];
  projectiles: Projectile[] = [];
  /** Things that happened since the screen last looked (floating gold, leaks). */
  events: GameEvent[] = [];

  private spawners: Spawner[] = [];
  private nextId = 1;
  private rng: () => number;
  private enemyById = new Map<number, Enemy>();
  private holders = new Map<number, Holder>();
  readonly hero: Hero;
  readonly abilities: ReadonlySet<HeroAbility>;
  readonly specials: Record<SpecialKind, SpecialProgress>;
  /** Seconds until each special can be used again (0 = ready). */
  specialIn: Record<SpecialKind, number> = { reinforce: 0, volley: 0 };
  soldiers: Soldier[] = [];
  strikes: Strike[] = [];

  constructor(readonly level: Level, readonly balance: Balance, seed = 1, options: GameOptions = {}) {
    const { abilities = [], heroXp = 0 } = options;
    this.specials = {
      reinforce: options.specials?.reinforce ?? { level: 1, extra: false },
      volley: options.specials?.volley ?? { level: 1, extra: false },
    };
    this.paths = level.paths.map((p) => buildPath(p.points));
    this.pads = level.pads.map(([x, y]) => ({ x, y }));
    this.towers = level.pads.map(() => null);
    this.totalWaves = level.waves.length;
    this.gold = level.startGold ?? balance.rules.startGold;
    this.lives = balance.rules.lives;
    this.rng = makeRng(seed);
    this.abilities = new Set(abilities);
    const start = level.heroStart ? { x: level.heroStart[0], y: level.heroStart[1] } : pointAt(this.paths[0], this.paths[0].length * 0.55);
    this.hero = {
      id: this.nextId++,
      x: start.x,
      y: start.y,
      hp: balance.hero.hp,
      state: 'idle',
      target: null,
      holding: [],
      cooldown: 0,
      respawnIn: 0,
      hitAge: 9,
      home: { ...start },
      dest: null,
      stompIn: 0,
      stompAge: 9,
      xp: 0,
      level: 1,
    };
    // XP is kept between battles: start at the level it already earned, at full health.
    this.hero.xp = heroXp;
    while (this.heroNextXp() !== null && this.hero.xp >= this.heroNextXp()!) this.hero.level++;
    this.hero.hp = this.heroStats().hp;
  }

  get rules() {
    return this.balance.rules;
  }

  // ---- Commands from the player ----

  /** Gold the player gets for calling the next wave now (0 before wave 1). */
  earlyBonus(): number {
    if (this.nextWaveIn === null) return 0;
    return Math.round(this.nextWaveIn * this.rules.earlyBonusPerSecond);
  }

  canCallWave(): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    if (this.wavesStarted >= this.totalWaves) return false;
    return this.wavesStarted === 0 || this.nextWaveIn !== null;
  }

  callWave(): boolean {
    if (!this.canCallWave()) return false;
    const bonus = this.earlyBonus();
    this.gold += bonus;
    this.startWave(bonus);
    return true;
  }

  towerLevel(type: string, level: number): TowerLevel | undefined {
    return this.balance.towers[type]?.levels[level];
  }

  build(pad: number, type: string): boolean {
    const spec = this.towerLevel(type, 0);
    if (!spec || this.towers[pad] || this.gold < spec.cost || this.isOver()) return false;
    this.gold -= spec.cost;
    const tower: Tower = { pad, type, level: 0, cooldown: 0.3, spent: spec.cost, shotAge: 9, rally: null, knights: [] };
    if (spec.unit) {
      const p = this.pads[pad];
      tower.rally = this.defaultRally(pad);
      for (let slot = 0; slot < spec.unit.count; slot++) {
        tower.knights.push({ id: this.nextId++, pad, slot, x: p.x, y: p.y, hp: spec.unit.hp, state: 'walking', target: null, holding: [], cooldown: 0, respawnIn: 0, hitAge: 9 });
      }
    }
    this.towers[pad] = tower;
    return true;
  }

  upgradeCost(pad: number): number | null {
    const t = this.towers[pad];
    if (!t) return null;
    return this.towerLevel(t.type, t.level + 1)?.cost ?? null;
  }

  upgrade(pad_: number): boolean {
    const t = this.towers[pad_];
    const cost = this.upgradeCost(pad_);
    if (!t || cost === null || this.gold < cost || this.isOver()) return false;
    this.gold -= cost;
    t.level++;
    t.spent += cost;
    // Upgraded knights come back to full (new) health, fallen ones straight away.
    const unit = this.towerLevel(t.type, t.level)?.unit;
    const pad = this.pads[pad_];
    if (unit) {
      for (const k of t.knights) {
        if (k.state === 'dead') Object.assign(k, { state: 'walking', x: pad.x, y: pad.y, target: null, holding: [], respawnIn: 0 });
        k.hp = unit.hp;
      }
    }
    return true;
  }

  sellValue(pad: number): number {
    const t = this.towers[pad];
    return t ? Math.floor(t.spent * this.rules.sellRefund) : 0;
  }

  sell(pad: number): boolean {
    if (!this.towers[pad] || this.isOver()) return false;
    this.gold += this.sellValue(pad);
    this.towers[pad] = null;
    return true;
  }

  /** Where a hall's flag would stand for a tap at (x, y): the nearest road within the hall's reach, or null. */
  rallyFor(pad: number, x: number, y: number): Rally | null {
    const t = this.towers[pad];
    const spec = t && this.towerLevel(t.type, t.level);
    if (!t || !spec?.unit) return null;
    const p = this.pads[pad];
    const rally = this.nearestRoad((s) => (Math.hypot(s.x - p.x, s.y - p.y) <= spec.range ? Math.hypot(s.x - x, s.y - y) : Infinity));
    return rally && Math.hypot(rally.x - x, rally.y - y) <= FLAG_SNAP ? rally : null;
  }

  /** Where a new hall on this pad puts its flag: the nearest road. */
  defaultRally(pad: number): Rally | null {
    const p = this.pads[pad];
    return this.nearestRoad((s) => Math.hypot(s.x - p.x, s.y - p.y));
  }

  /** Moves a hall's flag to the road near (x, y). False if that isn't on the road within the hall's reach. */
  setRally(pad: number, x: number, y: number): boolean {
    const t = this.towers[pad];
    const rally = this.rallyFor(pad, x, y);
    if (!t || !rally) return false;
    t.rally = rally;
    for (const k of t.knights) {
      k.target = null;
      k.holding = [];
    }
    return true;
  }

  /** Sends the hero riding to (x, y); it stands guard there. False while it is down. */
  moveHero(x: number, y: number): boolean {
    const h = this.hero;
    if (h.state === 'dead' || this.isOver()) return false;
    h.dest = { x: Math.max(20, Math.min(WORLD_W - 20, x)), y: Math.max(60, Math.min(WORLD_H - 20, y)) };
    this.release(h);
    h.target = null;
    return true;
  }

  /** Reinforcements' stats at the level the player bought. */
  soldierStats() {
    const spec = this.balance.specials.reinforce;
    return spec.levels[Math.min(spec.levels.length, this.specials.reinforce.level) - 1];
  }

  /** Arrow Volley's damage and size at the level the player bought. */
  volleyStats() {
    const spec = this.balance.specials.volley;
    return spec.levels[Math.min(spec.levels.length, this.specials.volley.level) - 1];
  }

  /** Where Reinforcements would stand for a tap at (x, y): the nearest road within reach, or null. */
  reinforceSpot(x: number, y: number): Rally | null {
    const spot = this.nearestRoad((s) => Math.hypot(s.x - x, s.y - y));
    return spot && Math.hypot(spot.x - x, spot.y - y) <= FLAG_SNAP ? spot : null;
  }

  /** Brings soldiers to the road near (x, y). False if not ready or not on the road. */
  callReinforcements(x: number, y: number): boolean {
    const spec = this.balance.specials.reinforce;
    const spot = this.reinforceSpot(x, y);
    if (!spot || this.specialIn.reinforce > 0 || this.isOver()) return false;
    const stats = this.soldierStats();
    for (let slot = 0; slot < spec.count; slot++) {
      // Side by side across the road.
      const post = pointAt(this.paths[spot.path], spot.d, (slot - (spec.count - 1) / 2) * 26);
      this.soldiers.push({
        id: this.nextId++, pad: -1, slot, x: post.x, y: post.y, hp: stats.hp, state: 'idle', target: null, holding: [],
        cooldown: 0, respawnIn: 0, hitAge: 9, post, leavesIn: spec.duration,
      });
    }
    this.specialIn.reinforce = spec.cooldown;
    return true;
  }

  /** Sends an Arrow Volley at (x, y) (plus scattered ones with the extra). False if not ready. */
  callVolley(x: number, y: number): boolean {
    const spec = this.balance.specials.volley;
    if (this.specialIn.volley > 0 || this.isOver()) return false;
    const stats = this.volleyStats();
    this.strikes.push({ x, y, radius: stats.radius, damage: stats.damage, left: spec.delay, delay: spec.delay });
    if (this.specials.volley.extra) {
      for (let i = 0; i < spec.extraSpots; i++) {
        // A random spot on a road, inside the map.
        const path = this.paths[Math.floor(this.rng() * this.paths.length)];
        const inside = path.samples.filter((s) => s.x > 40 && s.x < WORLD_W - 40 && s.y > 40 && s.y < WORLD_H - 40);
        const s = inside[Math.floor(this.rng() * inside.length)];
        if (s) this.strikes.push({ x: s.x, y: s.y, radius: spec.extraRadius, damage: stats.damage, left: spec.delay, delay: spec.delay });
      }
    }
    this.specialIn.volley = spec.cooldown;
    return true;
  }

  /** The hero's health, sword and armor at its current level. */
  heroStats(): { hp: number; damage: [number, number]; armor: number } {
    const spec = this.balance.hero;
    return this.hero.level > 1 ? spec.levels[this.hero.level - 2] : spec;
  }

  /** XP needed for the hero's next level, or null at the top level. */
  heroNextXp(): number | null {
    return this.balance.hero.levels[this.hero.level - 1]?.xp ?? null;
  }

  /** Whether a knight stands close enough to the hero to get the rally ability's boost. */
  inRally(k: { x: number; y: number }): boolean {
    const h = this.hero;
    return this.abilities.has('rally') && h.state !== 'dead' && Math.hypot(k.x - h.x, k.y - h.y) <= this.balance.hero.rally.radius;
  }

  isOver(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  /** 0 to 3 stars; 0 unless the level is won. */
  stars(): number {
    if (this.phase !== 'won') return 0;
    const [three, two] = this.rules.starLives;
    return this.lives >= three ? 3 : this.lives >= two ? 2 : 1;
  }

  /** Where a knight of this hall stands when it isn't fighting. */
  knightPost(t: Tower, slot: number): { x: number; y: number } {
    const r = t.rally!;
    const [along, side] = POSTS[slot % POSTS.length];
    return pointAt(this.paths[r.path], r.d + along, side);
  }

  // ---- Simulation ----

  step(dt = STEP): void {
    if (this.isOver()) return;
    this.time += dt;
    this.enemyById.clear();
    for (const e of this.enemies) this.enemyById.set(e.id, e);
    this.holders.clear();
    for (const t of this.towers) if (t) for (const k of t.knights) this.holders.set(k.id, k);
    this.holders.set(this.hero.id, this.hero);
    for (const k of this.soldiers) this.holders.set(k.id, k);

    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateHero(dt);
    this.updateSpecials(dt);
    this.updateProjectiles(dt);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => !p.done);
    this.checkEnd();
  }

  private startWave(bonus: number): void {
    const wave = this.level.waves[this.wavesStarted];
    this.wavesStarted++;
    this.phase = 'playing';
    this.nextWaveIn = null;
    for (const g of wave.groups) {
      this.spawners.push({ enemy: g.enemy, path: g.path ?? 0, left: g.count, interval: g.interval, timer: g.delay ?? 0 });
    }
    this.events.push({ kind: 'wave', wave: this.wavesStarted, bonus });
  }

  private updateWaves(dt: number): void {
    for (const s of this.spawners) {
      s.timer -= dt;
      while (s.left > 0 && s.timer <= 0) {
        this.spawn(s.enemy, s.path);
        s.left--;
        s.timer += s.interval;
      }
    }
    this.spawners = this.spawners.filter((s) => s.left > 0);

    const spawning = this.spawners.length > 0;
    const more = this.wavesStarted < this.totalWaves;
    if (this.wavesStarted > 0 && !spawning && more) {
      if (this.nextWaveIn === null) this.nextWaveIn = this.rules.waveGap;
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) this.startWave(0);
    }
  }

  private spawn(type: string, path: number): void {
    const spec = this.balance.enemies[type];
    if (!spec) throw new Error(`Unknown enemy "${type}" in level ${this.level.id}`);
    const lanes = this.rules.laneOffsets;
    const lane = lanes[Math.floor(this.rng() * lanes.length)] + (this.rng() * 2 - 1) * this.rules.laneJitter;
    const p = pointAt(this.paths[path], 0, lane);
    const e: Enemy = { id: this.nextId++, type, spec, hp: spec.hp, path, d: 0, lane, x: p.x, y: p.y, alive: true, heldBy: null, attackCooldown: spec.attackCooldown / 2, hitAge: 9 };
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.hitAge += dt;

      // Held by a knight: stand still and fight back once the knight has arrived.
      if (e.heldBy !== null) {
        const k = this.holders.get(e.heldBy);
        if (!k || k.state === 'dead' || !k.holding.includes(e.id)) e.heldBy = null;
        else {
          e.attackCooldown -= dt;
          // Enemies held next to a fighting knight hit back.
          const close = Math.hypot(k.x - e.x, k.y - e.y) <= e.spec.size + 14 + HOLD_REACH;
          if (k.state === 'fighting' && close && e.attackCooldown <= 0) {
            this.hitHolder(k, e.spec.attack);
            e.attackCooldown = e.spec.attackCooldown;
          }
          continue;
        }
      }

      e.d += e.spec.speed * dt;
      const path = this.paths[e.path];
      if (e.d >= path.length) {
        e.alive = false;
        this.lives = Math.max(0, this.lives - e.spec.lifeCost);
        this.events.push({ kind: 'leak', x: e.x, y: e.y, lives: e.spec.lifeCost });
        continue;
      }
      const p = pointAt(path, e.d, e.lane);
      e.x = p.x;
      e.y = p.y;
    }
  }

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      if (!t) continue;
      const spec = this.towerLevel(t.type, t.level)!;
      if (spec.unit) {
        this.updateHall(t, spec, dt);
        continue;
      }
      t.shotAge += dt;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const pad = this.pads[t.pad];
      const splash = spec.splash ?? 0;
      const target = this.pickTarget(pad.x, pad.y, spec.range, splash === 0);
      if (!target) {
        t.cooldown = 0;
        continue;
      }
      const base = {
        x: pad.x,
        y: pad.y - 50,
        sx: pad.x,
        sy: pad.y - 50,
        target: target.id,
        damage: this.roll(spec.damage),
        damageType: spec.damageType,
        pierce: spec.armorPierce ?? 0,
        splash,
        t: 0,
        flight: 0,
        done: false,
      };
      if (splash > 0) {
        // Aim where the target will be when the shell comes down.
        const flight = 0.6 + Math.hypot(target.x - pad.x, target.y - pad.y) / 500;
        const ahead = target.heldBy === null ? target.spec.speed * flight : 0;
        const path = this.paths[target.path];
        const spot = pointAt(path, Math.min(path.length, target.d + ahead), target.lane);
        this.projectiles.push({ ...base, kind: 'shell', tx: spot.x, ty: spot.y, speed: 0, flight });
      } else {
        this.projectiles.push({ ...base, kind: spec.damageType === 'magic' ? 'bolt' : 'arrow', tx: target.x, ty: target.y, speed: spec.damageType === 'magic' ? 650 : 900 });
      }
      t.cooldown = spec.cooldown;
      t.shotAge = 0;
    }
  }

  private updateHall(t: Tower, spec: TowerLevel, dt: number): void {
    const unit = spec.unit!;
    const pad = this.pads[t.pad];
    for (const k of t.knights) {
      k.hitAge += dt;
      if (k.state === 'dead') {
        k.respawnIn -= dt;
        if (k.respawnIn <= 0) Object.assign(k, { state: 'walking', hp: unit.hp, x: pad.x, y: pad.y, target: null, holding: [] });
        continue;
      }

      k.holding = k.holding.filter((id) => {
        const e = this.enemyById.get(id);
        return !!e?.alive && e.heldBy === k.id;
      });
      this.fight(k, unit, spec.damage, spec.cooldown, spec.damageType, this.knightPost(t, k.slot), ENGAGE_RANGE, dt);
    }
  }

  /** A foe near (x, y): free enemies first, then help someone already holding one. */
  private findFoe(x: number, y: number, range: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.spec.flying || Math.hypot(e.x - x, e.y - y) > range) continue;
      const score = (e.heldBy === null ? 0 : 1e6) + (this.paths[e.path].length - e.d);
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  private walk(k: { x: number; y: number }, x: number, y: number, step: number): void {
    const dx = x - k.x;
    const dy = y - k.y;
    const len = Math.hypot(dx, dy) || 1;
    k.x += (dx / len) * step;
    k.y += (dy / len) * step;
  }

  private updateSpecials(dt: number): void {
    for (const kind of ['reinforce', 'volley'] as const) this.specialIn[kind] = Math.max(0, this.specialIn[kind] - dt);

    const spec = this.balance.specials.reinforce;
    const stats = this.soldierStats();
    const unit = { holds: spec.holds, speed: spec.speed, regen: 0, hp: stats.hp };
    for (const k of this.soldiers) {
      k.hitAge += dt;
      k.leavesIn -= dt;
      if (k.state === 'dead') continue;
      k.holding = k.holding.filter((id) => {
        const e = this.enemyById.get(id);
        return !!e?.alive && e.heldBy === k.id;
      });
      this.fight(k, unit, stats.damage, spec.attackCooldown, 'physical', k.post, ENGAGE_RANGE, dt);
      // Sky spears: when not busy on the road, hit flyers passing close by.
      if (this.specials.reinforce.extra && k.state !== 'fighting') {
        k.cooldown -= dt;
        const flyer = this.enemies.find((e) => e.alive && e.spec.flying && Math.hypot(e.x - k.x, e.y - k.y) <= spec.skyReach);
        if (flyer && k.cooldown <= 0) {
          this.hit(flyer, this.roll(stats.damage), 'physical');
          k.cooldown = spec.attackCooldown;
          k.hitAge = 9;
          this.events.push({ kind: 'spear', x: k.x, y: k.y, tx: flyer.x, ty: flyer.y - FLY_HEIGHT - flyer.spec.size });
        }
      }
    }
    for (const k of this.soldiers) if (k.leavesIn <= 0 && k.state !== 'dead') this.release(k);
    this.soldiers = this.soldiers.filter((k) => k.leavesIn > 0 && k.state !== 'dead');

    for (const st of this.strikes) {
      st.left -= dt;
      if (st.left > 0) continue;
      for (const e of this.enemies) if (e.alive && Math.hypot(e.x - st.x, e.y - st.y) <= st.radius) this.hit(e, st.damage, 'physical');
      this.events.push({ kind: 'boom', x: st.x, y: st.y, radius: st.radius });
    }
    this.strikes = this.strikes.filter((st) => st.left > 0);
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    const spec = this.balance.hero;
    h.hitAge += dt;
    h.stompAge += dt;
    if (h.state === 'dead') {
      h.respawnIn -= dt;
      if (h.respawnIn <= 0) Object.assign(h, { state: 'walking', hp: this.heroStats().hp, x: h.home.x, y: h.home.y, target: null, holding: [], dest: null });
      return;
    }
    h.holding = h.holding.filter((id) => {
      const e = this.enemyById.get(id);
      return !!e?.alive && e.heldBy === h.id;
    });

    if (h.dest) {
      // Riding to a new spot: no fighting on the way.
      const dist = Math.hypot(h.dest.x - h.x, h.dest.y - h.y);
      if (dist <= spec.speed * dt) {
        h.x = h.dest.x;
        h.y = h.dest.y;
        h.home = h.dest;
        h.dest = null;
        h.state = 'idle';
      } else {
        h.state = 'walking';
        this.walk(h, h.dest.x, h.dest.y, spec.speed * dt);
      }
    } else {
      const stats = this.heroStats();
      this.fight(h, { ...spec, hp: stats.hp }, stats.damage, spec.cooldown, 'physical', h.home, spec.engageRange, dt);
    }

    if (this.abilities.has('stomp')) {
      const stomp = spec.stomp;
      h.stompIn = Math.max(0, h.stompIn - dt);
      if (h.stompIn === 0) {
        const hits = this.enemies.filter((e) => e.alive && !e.spec.flying && Math.hypot(e.x - h.x, e.y - h.y) <= stomp.radius);
        if (hits.length) {
          for (const e of hits) this.hit(e, stomp.damage, 'physical', 1, true);
          this.events.push({ kind: 'boom', x: h.x, y: h.y, radius: stomp.radius, stomp: true });
          h.stompIn = stomp.every;
          h.stompAge = 0;
        }
      }
    }
  }

  /** One holder's turn: pick a foe near `post`, hold it, walk up and hit it; otherwise return to `post` and heal. */
  private fight(
    k: Holder,
    unit: { holds: number; speed: number; regen: number; hp: number },
    damage: [number, number],
    cooldown: number,
    damageType: DamageType,
    post: { x: number; y: number },
    range: number,
    dt: number,
  ): void {
    let target = k.target === null ? undefined : this.enemyById.get(k.target);
    if (!target?.alive) {
      k.target = null;
      target = k.holding.length ? this.enemyById.get(k.holding[0]) : this.findFoe(post.x, post.y, range);
      if (target) k.target = target.id;
    }
    if (target && target.heldBy === null) {
      if (k.holding.length < unit.holds) {
        target.heldBy = k.id;
        k.holding.push(target.id);
      } else {
        target = this.enemyById.get(k.holding[0]);
        k.target = target?.id ?? null;
      }
    }
    if (k.state === 'fighting' && k.holding.length < unit.holds) {
      for (const e of this.enemies) {
        if (k.holding.length >= unit.holds) break;
        if (!e.alive || e.spec.flying || e.heldBy !== null) continue;
        if (Math.hypot(e.x - k.x, e.y - k.y) > e.spec.size + 14 + HOLD_REACH) continue;
        e.heldBy = k.id;
        k.holding.push(e.id);
      }
    }
    if (target) {
      const reach = target.spec.size + 14;
      const dist = Math.hypot(k.x - target.x, k.y - target.y);
      if (dist > reach + 1) {
        k.state = 'walking';
        this.walk(k, target.x, target.y, Math.min(unit.speed * dt, dist - reach));
      } else {
        k.state = 'fighting';
        k.cooldown -= dt;
        if (k.cooldown <= 0) {
          this.hit(target, this.roll(damage), damageType, 0, k === this.hero);
          k.cooldown = cooldown;
        }
      }
    } else {
      const dist = Math.hypot(post.x - k.x, post.y - k.y);
      if (dist < 1) {
        k.state = 'idle';
        k.hp = Math.min(unit.hp, k.hp + unit.regen * dt);
      } else {
        k.state = 'walking';
        this.walk(k, post.x, post.y, Math.min(unit.speed * dt, dist));
      }
    }
  }

  /** Lets go of every enemy this holder holds. */
  private release(k: Holder): void {
    for (const id of k.holding) {
      const e = this.enemyById.get(id);
      if (e?.heldBy === k.id) e.heldBy = null;
    }
    k.holding = [];
  }

  private hitHolder(k: Holder, [lo, hi]: [number, number]): void {
    let armor: number;
    let respawn: number;
    let boost = 1;
    if (k === this.hero) {
      armor = this.heroStats().armor;
      respawn = this.balance.hero.respawn;
    } else if ((k as Knight).pad === -1) {
      armor = this.soldierStats().armor;
      respawn = 0;
      if (this.inRally(k)) boost = 1 + this.balance.hero.rally.hpBoost;
    } else {
      const t = this.towers[(k as Knight).pad];
      const unit = t && this.towerLevel(t.type, t.level)?.unit;
      if (!unit) return;
      armor = unit.armor;
      respawn = unit.respawn;
      if (this.inRally(k)) boost = 1 + this.balance.hero.rally.hpBoost;
    }
    k.hp -= damageAfterDefence(lo + this.rng() * (hi - lo), 'physical', { armor }) / boost;
    k.hitAge = 0;
    if (k.hp <= 0) {
      k.state = 'dead';
      k.respawnIn = respawn;
      k.target = null;
      this.release(k);
    }
  }

  /** Nearest road point by `score` (lower is better), or null if every score is Infinity. */
  private nearestRoad(score: (s: { x: number; y: number }) => number): Rally | null {
    let best: Rally | null = null;
    let bestScore = Infinity;
    this.paths.forEach((path, pi) => {
      for (const s of path.samples) {
        // Stay off the parts of the road that run outside the map.
        if (s.x < 30 || s.x > WORLD_W - 30 || s.y < 30 || s.y > WORLD_H - 30) continue;
        const v = score(s);
        if (v < bestScore) {
          bestScore = v;
          best = { path: pi, d: s.d, x: s.x, y: s.y };
        }
      }
    });
    return best;
  }

  private roll([lo, hi]: [number, number]): number {
    return lo + this.rng() * (hi - lo);
  }

  /** The enemy in range that is furthest along its road. */
  private pickTarget(x: number, y: number, range: number, hitsFlying: boolean): Enemy | null {
    let best: Enemy | null = null;
    let bestLeft = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || (e.spec.flying && !hitsFlying) || Math.hypot(e.x - x, e.y - y) > range) continue;
      const left = this.paths[e.path].length - e.d;
      if (left < bestLeft) {
        best = e;
        bestLeft = left;
      }
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.kind === 'shell') {
        p.t = Math.min(1, p.t + dt / p.flight);
        p.x = p.sx + (p.tx - p.sx) * p.t;
        p.y = p.sy + (p.ty - p.sy) * p.t;
        if (p.t >= 1) {
          p.done = true;
          this.events.push({ kind: 'boom', x: p.tx, y: p.ty, radius: p.splash });
          for (const e of this.enemies) {
            if (e.alive && !e.spec.flying && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) this.hit(e, p.damage, p.damageType, p.pierce);
          }
        }
        continue;
      }
      const target = this.enemyById.get(p.target);
      if (target?.alive) {
        p.tx = target.x;
        p.ty = target.y - target.spec.size - (target.spec.flying ? FLY_HEIGHT : 0);
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (dist <= move) {
        p.done = true;
        if (target?.alive) this.hit(target, p.damage, p.damageType, p.pierce);
      } else {
        p.x += (dx / dist) * move;
        p.y += (dy / dist) * move;
      }
    }
  }

  private hit(e: Enemy, amount: number, type: DamageType, pierce = 0, byHero = false): void {
    e.hp -= damageAfterDefence(amount, type, e.spec, pierce);
    e.hitAge = 0;
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      this.gold += e.spec.bounty;
      this.events.push({ kind: 'gold', x: e.x, y: e.y - e.spec.size * 2, amount: e.spec.bounty });
      if (byHero) this.gainXp(e.spec.bounty);
    }
  }

  /** The hero earns XP (the defeated enemy's gold); each new level heals it fully. */
  private gainXp(xp: number): void {
    const h = this.hero;
    h.xp += xp;
    for (let next = this.heroNextXp(); next !== null && h.xp >= next; next = this.heroNextXp()) {
      h.level++;
      if (h.state !== 'dead') h.hp = this.heroStats().hp;
      this.events.push({ kind: 'levelUp', x: h.x, y: h.y - 90, level: h.level });
    }
  }

  private checkEnd(): void {
    if (this.lives <= 0) {
      this.phase = 'lost';
    } else if (
      this.wavesStarted === this.totalWaves &&
      this.spawners.length === 0 &&
      !this.enemies.some((e) => e.alive)
    ) {
      this.phase = 'won';
    }
  }
}
