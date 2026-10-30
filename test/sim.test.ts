import { describe, expect, it } from 'vitest';
import { buildPath, distanceToPath, pointAt } from '../src/path';
import { earnedStars, isUnlocked, loadProgress, saveStars, starsToSpend } from '../src/progress';
import { damageAfterDefence, Game, WORLD_H, WORLD_W, type Tower } from '../src/sim';
import type { HeroAbility } from '../src/types';
import { BALANCE, LEVELS } from './bot';

describe('road', () => {
  it('resamples to an even spacing and keeps both ends', () => {
    const p = buildPath([[0, 0], [100, 0], [100, 100]]);
    expect(p.samples[0]).toMatchObject({ x: 0, y: 0 });
    expect(p.samples.at(-1)).toMatchObject({ x: 100, y: 100 });
    const gaps = p.samples.slice(1).map((s, i) => Math.hypot(s.x - p.samples[i].x, s.y - p.samples[i].y));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.5);
  });

  it('puts lanes beside the centre line', () => {
    const p = buildPath([[0, 0], [200, 0]]);
    expect(pointAt(p, 100, 20).y).toBeCloseTo(-20);
    expect(pointAt(p, 100, -20).y).toBeCloseTo(20);
  });
});

describe('damage', () => {
  it('armor blocks physical damage only', () => {
    const brute = BALANCE.enemies.brute;
    expect(damageAfterDefence(10, 'physical', brute)).toBeCloseTo(10 * (1 - brute.armor));
    expect(damageAfterDefence(10, 'magic', brute)).toBeCloseTo(10 * (1 - brute.magicResist));
  });
});

describe('levels', () => {
  for (const level of LEVELS) {
    it(`${level.id}: build pads are off the road and inside the map`, () => {
      const g = new Game(level, BALANCE);
      for (const pad of g.pads) {
        expect(pad.x).toBeGreaterThan(40);
        expect(pad.x).toBeLessThan(WORLD_W - 40);
        expect(pad.y).toBeGreaterThan(90); // clear of the top bar
        expect(pad.y).toBeLessThan(WORLD_H - 40);
        for (const path of g.paths) expect(distanceToPath(path, pad.x, pad.y)).toBeGreaterThan(70);
      }
    });

    it(`${level.id}: every pad can put knights on the road`, () => {
      const g = new Game(level, BALANCE);
      g.gold = 1e6;
      g.pads.forEach((_, i) => {
        expect(g.build(i, 'knights')).toBe(true);
        const p = g.pads[i];
        const r = g.towers[i]!.rally!;
        expect(Math.hypot(r.x - p.x, r.y - p.y)).toBeLessThanOrEqual(BALANCE.towers.knights.levels[0].range);
      });
    });

    it(`${level.id}: only uses known enemies`, () => {
      for (const w of level.waves) for (const gr of w.groups) expect(BALANCE.enemies[gr.enemy]).toBeDefined();
    });
  }
});

describe('game rules', () => {
  const level = LEVELS[0];

  it('loses when nobody defends', () => {
    const g = new Game(level, BALANCE);
    g.callWave();
    for (let i = 0; i < 60 * 60 * 20 && !g.isOver(); i++) g.step();
    expect(g.phase).toBe('lost');
  });

  it('pays a bonus for calling a wave early', () => {
    const g = new Game(level, BALANCE);
    g.callWave();
    while (g.nextWaveIn === null) g.step();
    for (let i = 0; i < 60 * 5; i++) g.step();
    const gold = g.gold;
    const bonus = g.earlyBonus();
    expect(bonus).toBeGreaterThan(0);
    g.callWave();
    expect(g.gold).toBe(gold + bonus);
    expect(g.wavesStarted).toBe(2);
  });

  it('sells for part of what was spent', () => {
    const g = new Game(level, BALANCE);
    g.build(0, 'archer');
    const cost = BALANCE.towers.archer.levels[0].cost;
    expect(g.sellValue(0)).toBe(Math.floor(cost * BALANCE.rules.sellRefund));
  });
});

describe('knights', () => {
  const level = LEVELS[0];
  const hall = (g: Game): Tower => g.towers.find((t) => t?.type === 'knights')!;

  function gameWithHall(): Game {
    const g = new Game(level, BALANCE);
    g.build(0, 'knights');
    g.callWave();
    return g;
  }

  it('hold an enemy in place until it falls', () => {
    const g = gameWithHall();
    let held = undefined;
    for (let i = 0; i < 60 * 60 && !held; i++) {
      g.step();
      held = g.enemies.find((e) => e.heldBy !== null);
    }
    expect(held).toBeDefined();
    const d = held!.d;
    for (let i = 0; i < 30 && held!.alive; i++) g.step();
    expect(held!.d).toBe(d);
  });

  it('come back after falling', () => {
    const g = gameWithHall();
    const k = hall(g).knights[0];
    const state = () => k.state; // read fresh each time (the game changes it)
    while (state() !== 'fighting') g.step();
    k.hp = 0.01;
    for (let i = 0; i < 60 * 10 && state() !== 'dead'; i++) g.step();
    expect(state()).toBe('dead');
    const respawn = BALANCE.towers.knights.levels[0].unit!.respawn;
    for (let i = 0; i < 60 * (respawn + 0.5); i++) g.step();
    expect(state()).not.toBe('dead');
  });

  it('move their flag only to the road within reach', () => {
    const g = new Game(level, BALANCE);
    g.build(0, 'knights');
    const t = hall(g);
    const p = g.pads[0];
    expect(g.setRally(0, p.x, p.y)).toBe(false); // the pad itself isn't road
    expect(g.setRally(0, 1500, 650)).toBe(false); // road, but far away
    const start = t.rally!;
    const other = g.paths[0].samples.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 180 && Math.abs(s.d - start.d) > 100)!;
    expect(g.setRally(0, other.x + 10, other.y)).toBe(true);
    expect(t.rally!.d).not.toBe(start.d);
  });
});

describe('wizards, catapults and flyers', () => {
  const base = LEVELS[0];
  const onlyWave = (enemy: string, count: number, interval: number) => ({ ...base, waves: [{ groups: [{ enemy, count, interval }] }] });

  it('a catapult shell hurts every enemy in its splash', () => {
    const g = new Game(onlyWave('brute', 6, 0.15), BALANCE);
    g.gold = 1e6;
    g.build(2, 'catapult');
    g.callWave();
    let hurtAtOnce = 0;
    for (let i = 0; i < 60 * 60 && !g.isOver(); i++) {
      g.step();
      if (g.events.some((e) => e.kind === 'boom')) hurtAtOnce = Math.max(hurtAtOnce, g.enemies.filter((e) => e.hitAge === 0).length);
      g.events.length = 0;
    }
    expect(hurtAtOnce).toBeGreaterThan(1);
  });

  it('catapults never shoot at flyers, knights never hold them', () => {
    const g = new Game(onlyWave('wyrmling', 6, 1), BALANCE);
    g.gold = 1e6;
    g.build(2, 'catapult');
    g.build(3, 'knights');
    g.callWave();
    for (let i = 0; i < 60 * 90 && !g.isOver(); i++) {
      g.step();
      expect(g.projectiles.length).toBe(0);
      expect(g.enemies.every((e) => e.heldBy === null && e.hp === e.spec.hp)).toBe(true);
    }
    expect(g.lives).toBe(BALANCE.rules.lives - 6);
  });

  it('wizards ignore armor, archers do not', () => {
    const brute = BALANCE.enemies.brute;
    expect(damageAfterDefence(10, 'magic', brute)).toBe(10);
    expect(damageAfterDefence(10, 'physical', brute)).toBeLessThan(10);
    expect(damageAfterDefence(10, 'physical', brute, 0.5)).toBeCloseTo(10 * (1 - brute.armor / 2));
  });
});

describe('progress', () => {
  it('opens each level once the one before is won', () => {
    expect(isUnlocked(LEVELS, 0, {})).toBe(true);
    expect(isUnlocked(LEVELS, 1, {})).toBe(false);
    expect(isUnlocked(LEVELS, 1, { [LEVELS[0].id]: 1 })).toBe(true);
    expect(isUnlocked(LEVELS, 2, { [LEVELS[0].id]: 3 })).toBe(false);
  });

  it('counts stars to spend on the hero', () => {
    const p = { a: 3, b: 2 };
    expect(earnedStars(p)).toBe(5);
    expect(starsToSpend(p, [], BALANCE.hero)).toBe(5);
    expect(starsToSpend(p, ['rally'], BALANCE.hero)).toBe(5 - BALANCE.hero.rally.cost);
  });

  it('survives having no storage at all', () => {
    expect(loadProgress()).toEqual({});
    expect(saveStars('x', 2)).toEqual({ x: 2 });
  });
});

describe('knights holding several enemies', () => {
  it('a knight holds up to `holds` enemies at once', () => {
    const balance = structuredClone(BALANCE);
    for (const l of balance.towers.knights.levels) l.unit!.holds = 3;
    const level = { ...LEVELS[0], waves: [{ groups: [{ enemy: 'brute', count: 12, interval: 0.3 }] }] };
    const g = new Game(level, balance);
    g.build(0, 'knights');
    g.callWave();
    let most = 0;
    for (let i = 0; i < 60 * 60 && !g.isOver(); i++) {
      g.step();
      for (const k of g.towers[0]!.knights) most = Math.max(most, k.holding.length);
      for (const e of g.enemies) if (e.heldBy !== null && e.heldBy !== g.hero.id) expect(g.towers[0]!.knights.find((k) => k.id === e.heldBy)!.holding).toContain(e.id);
    }
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(3);
  });
});

describe('data/balance.json makes sense', () => {
  const share = (v: number | undefined) => v === undefined || (v >= 0 && v <= 0.95);
  const range = ([lo, hi]: [number, number]) => lo >= 0 && hi >= lo;

  it('rules', () => {
    const r = BALANCE.rules;
    expect(r.startGold).toBeGreaterThanOrEqual(0);
    expect(r.lives).toBeGreaterThanOrEqual(1);
    expect(share(r.sellRefund)).toBe(true);
    expect(r.waveGap).toBeGreaterThan(0);
  });

  for (const [type, tower] of Object.entries(BALANCE.towers)) {
    it(`tower ${type}`, () => {
      expect(tower.levels.length).toBeGreaterThan(0);
      for (const l of tower.levels) {
        expect(l.cost).toBeGreaterThan(0);
        expect(l.range).toBeGreaterThan(0);
        expect(l.cooldown).toBeGreaterThan(0);
        expect(range(l.damage)).toBe(true);
        expect(share(l.armorPierce)).toBe(true);
        if (l.unit) {
          expect(l.unit.count).toBeGreaterThanOrEqual(1);
          expect(l.unit.hp).toBeGreaterThan(0);
          expect(share(l.unit.armor)).toBe(true);
          expect(Number.isInteger(l.unit.holds) && l.unit.holds >= 1).toBe(true);
          expect(l.unit.respawn).toBeGreaterThanOrEqual(0);
          expect(l.unit.speed).toBeGreaterThan(0);
        }
      }
    });
  }

  for (const [type, e] of Object.entries(BALANCE.enemies)) {
    it(`enemy ${type}`, () => {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.speed).toBeGreaterThan(0);
      expect(share(e.armor)).toBe(true);
      expect(share(e.magicResist)).toBe(true);
      expect(e.bounty).toBeGreaterThanOrEqual(0);
      expect(e.lifeCost).toBeGreaterThanOrEqual(1);
      expect(range(e.attack)).toBe(true);
      expect(e.attackCooldown).toBeGreaterThan(0);
    });
  }

  for (const level of LEVELS) {
    it(`level ${level.id}: waves`, () => {
      expect(level.waves.length).toBeGreaterThan(0);
      for (const w of level.waves) {
        for (const g of w.groups) {
          expect(g.count).toBeGreaterThanOrEqual(1);
          expect(g.interval).toBeGreaterThan(0);
          expect(level.paths[g.path ?? 0]).toBeDefined();
        }
      }
    });
  }
});

describe('hero', () => {
  const level = LEVELS[0];
  const wave = (enemy: string, count: number, interval: number) => ({ ...level, waves: [{ groups: [{ enemy, count, interval }] }] });

  it('rides where it is sent and holds enemies there', () => {
    const g = new Game(wave('brute', 8, 1), BALANCE);
    const spot = pointAt(g.paths[0], 400);
    expect(g.moveHero(spot.x, spot.y)).toBe(true);
    for (let i = 0; i < 60 * 10; i++) g.step();
    expect(Math.hypot(g.hero.x - spot.x, g.hero.y - spot.y)).toBeLessThan(1);
    g.callWave();
    let most = 0;
    for (let i = 0; i < 60 * 30 && !g.isOver(); i++) {
      g.step();
      most = Math.max(most, g.hero.holding.length);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(BALANCE.hero.holds);
  });

  it('stomps only once bought, every few seconds, for its damage', () => {
    const stomps = (abilities: HeroAbility[]) => {
      const g = new Game(wave('troll', 1, 1), BALANCE, 1, abilities);
      g.callWave();
      let n = 0;
      for (let i = 0; i < 60 * 60 && !g.isOver(); i++) {
        g.step();
        n += g.events.filter((e) => e.kind === 'boom' && e.stomp).length;
        g.events.length = 0;
      }
      return n;
    };
    expect(stomps([])).toBe(0);
    expect(stomps(['stomp'])).toBeGreaterThan(0);
    const g = new Game(wave('troll', 1, 1), BALANCE, 1, ['stomp']);
    g.callWave();
    const troll = () => g.enemies[0];
    while (!g.events.some((e) => e.kind === 'boom' && e.stomp)) {
      g.events.length = 0;
      const before = troll()?.hp;
      g.step();
      if (g.events.some((e) => e.kind === 'boom' && e.stomp)) expect(before! - troll().hp).toBeGreaterThanOrEqual(BALANCE.hero.stomp.damage);
    }
    expect(g.hero.stompIn).toBe(BALANCE.hero.stomp.every);
  });

  it('rally makes nearby knights last longer', () => {
    const lostHp = (abilities: HeroAbility[]) => {
      const g = new Game(wave('brute', 1, 1), BALANCE, 1, abilities);
      g.build(0, 'knights');
      const t = g.towers[0]!;
      for (let i = 0; i < 60 * 5; i++) g.step();
      g.moveHero(t.rally!.x + 30, t.rally!.y - 60);
      for (let i = 0; i < 60 * 5; i++) g.step();
      expect(g.inRally(t.knights[0])).toBe(abilities.includes('rally'));
      const k = t.knights[0];
      const hp = k.hp;
      for (let i = 0; i < 100; i++) (g as unknown as { hitHolder: (k: unknown, a: [number, number]) => void }).hitHolder(k, [0.1, 0.1]);
      return hp - k.hp;
    };
    expect(lostHp(['rally'])).toBeCloseTo(lostHp([]) / (1 + BALANCE.hero.rally.hpBoost));
  });
});

describe('upgrading a hall', () => {
  it('brings fallen knights back straight away', () => {
    const g = new Game(LEVELS[0], BALANCE);
    g.gold = 1e6;
    g.build(0, 'knights');
    const k = g.towers[0]!.knights[0];
    k.state = 'dead';
    k.respawnIn = 99;
    g.upgrade(0);
    expect(k.state).not.toBe('dead');
    expect(k.hp).toBe(BALANCE.towers.knights.levels[1].unit!.hp);
  });
});
