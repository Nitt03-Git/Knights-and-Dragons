import { describe, expect, it } from 'vitest';
import { buildPath, distanceToPath, pointAt } from '../src/path';
import { damageAfterDefence, Game, WORLD_H, WORLD_W } from '../src/sim';
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
