// The game rules. No drawing and no DOM here: the screen only reads this state and sends commands,
// so the same game can run in tests, at 2x speed, or behind any art style.
import { buildPath, pointAt, type Path } from './path';
import { makeRng } from './rng';
import type { Balance, DamageType, EnemySpec, Level, TowerLevel } from './types';

/** World size in units. Levels are drawn in this space and the screen scales it to fit. */
export const WORLD_W = 1600;
export const WORLD_H = 900;
export const STEP = 1 / 60;
/** Knights go after enemies this close to their flag. */
export const ENGAGE_RANGE = 95;
/** How close a tapped point must be to the road to move a flag there. */
export const FLAG_SNAP = 70;
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
  /** Pad of the hall it belongs to. */
  pad: number;
  slot: number;
  x: number;
  y: number;
  hp: number;
  state: KnightState;
  target: number | null;
  cooldown: number;
  respawnIn: number;
  hitAge: number;
}

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
  x: number;
  y: number;
  target: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  done: boolean;
}

export type GameEvent =
  | { kind: 'gold'; x: number; y: number; amount: number }
  | { kind: 'leak'; x: number; y: number; lives: number }
  | { kind: 'wave'; wave: number; bonus: number };

interface Spawner {
  enemy: string;
  path: number;
  left: number;
  interval: number;
  timer: number;
}

/** Damage after armor (physical) or magic resistance (magic). */
export function damageAfterDefence(amount: number, type: DamageType, spec: { armor: number; magicResist?: number }): number {
  const block = type === 'physical' ? spec.armor : (spec.magicResist ?? 0);
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
  private knightById = new Map<number, Knight>();

  constructor(readonly level: Level, readonly balance: Balance, seed = 1) {
    this.paths = level.paths.map((p) => buildPath(p.points));
    this.pads = level.pads.map(([x, y]) => ({ x, y }));
    this.towers = level.pads.map(() => null);
    this.totalWaves = level.waves.length;
    this.gold = balance.rules.startGold;
    this.lives = balance.rules.lives;
    this.rng = makeRng(seed);
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
      tower.rally = this.nearestRoad((s) => Math.hypot(s.x - p.x, s.y - p.y));
      for (let slot = 0; slot < spec.unit.count; slot++) {
        tower.knights.push({ id: this.nextId++, pad, slot, x: p.x, y: p.y, hp: spec.unit.hp, state: 'walking', target: null, cooldown: 0, respawnIn: 0, hitAge: 9 });
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

  upgrade(pad: number): boolean {
    const t = this.towers[pad];
    const cost = this.upgradeCost(pad);
    if (!t || cost === null || this.gold < cost || this.isOver()) return false;
    this.gold -= cost;
    t.level++;
    t.spent += cost;
    // Upgraded knights come back to full (new) health.
    const unit = this.towerLevel(t.type, t.level)?.unit;
    if (unit) for (const k of t.knights) if (k.state !== 'dead') k.hp = unit.hp;
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

  /** Moves a hall's flag to the road near (x, y). False if that isn't on the road within the hall's reach. */
  setRally(pad: number, x: number, y: number): boolean {
    const t = this.towers[pad];
    const spec = t && this.towerLevel(t.type, t.level);
    if (!t || !spec?.unit) return false;
    const p = this.pads[pad];
    const rally = this.nearestRoad((s) => (Math.hypot(s.x - p.x, s.y - p.y) <= spec.range ? Math.hypot(s.x - x, s.y - y) : Infinity));
    if (!rally || Math.hypot(rally.x - x, rally.y - y) > FLAG_SNAP) return false;
    t.rally = rally;
    for (const k of t.knights) k.target = null;
    return true;
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
    this.knightById.clear();
    for (const t of this.towers) if (t) for (const k of t.knights) this.knightById.set(k.id, k);

    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
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
        const k = this.knightById.get(e.heldBy);
        if (!k || k.state === 'dead' || k.target !== e.id) e.heldBy = null;
        else {
          e.attackCooldown -= dt;
          if (k.state === 'fighting' && e.attackCooldown <= 0) {
            this.hitKnight(k, e.spec.attack);
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
      const target = this.pickTarget(pad.x, pad.y, spec.range);
      if (!target) {
        t.cooldown = 0;
        continue;
      }
      this.projectiles.push({
        x: pad.x,
        y: pad.y - 50,
        target: target.id,
        tx: target.x,
        ty: target.y,
        speed: 900,
        damage: this.roll(spec.damage),
        damageType: spec.damageType,
        done: false,
      });
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
        if (k.respawnIn <= 0) Object.assign(k, { state: 'walking', hp: unit.hp, x: pad.x, y: pad.y, target: null });
        continue;
      }

      let target = k.target === null ? undefined : this.enemyById.get(k.target);
      if (!target?.alive) {
        k.target = null;
        target = this.findFoe(t);
        if (target) k.target = target.id;
      }
      if (target && target.heldBy === null) target.heldBy = k.id;

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
            this.hit(target, this.roll(spec.damage), spec.damageType);
            k.cooldown = spec.cooldown;
          }
        }
      } else {
        const post = this.knightPost(t, k.slot);
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
  }

  /** A foe for a knight: free enemies near the flag first, then help a fellow knight. */
  private findFoe(t: Tower): Enemy | undefined {
    const r = t.rally!;
    let best: Enemy | undefined;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.spec.flying || Math.hypot(e.x - r.x, e.y - r.y) > ENGAGE_RANGE) continue;
      const score = (e.heldBy === null ? 0 : 1e6) + (this.paths[e.path].length - e.d);
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  private walk(k: Knight, x: number, y: number, step: number): void {
    const dx = x - k.x;
    const dy = y - k.y;
    const len = Math.hypot(dx, dy) || 1;
    k.x += (dx / len) * step;
    k.y += (dy / len) * step;
  }

  private hitKnight(k: Knight, [lo, hi]: [number, number]): void {
    const t = this.towers[k.pad];
    const unit = t && this.towerLevel(t.type, t.level)?.unit;
    if (!unit) return;
    k.hp -= damageAfterDefence(lo + this.rng() * (hi - lo), 'physical', unit);
    k.hitAge = 0;
    if (k.hp <= 0) {
      k.state = 'dead';
      k.respawnIn = unit.respawn;
      k.target = null;
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
  private pickTarget(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestLeft = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - x, e.y - y) > range) continue;
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
      const target = this.enemyById.get(p.target);
      if (target?.alive) {
        p.tx = target.x;
        p.ty = target.y - target.spec.size;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (dist <= move) {
        p.done = true;
        if (target?.alive) this.hit(target, p.damage, p.damageType);
      } else {
        p.x += (dx / dist) * move;
        p.y += (dy / dist) * move;
      }
    }
  }

  private hit(e: Enemy, amount: number, type: DamageType): void {
    e.hp -= damageAfterDefence(amount, type, e.spec);
    e.hitAge = 0;
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      this.gold += e.spec.bounty;
      this.events.push({ kind: 'gold', x: e.x, y: e.y - e.spec.size * 2, amount: e.spec.bounty });
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
