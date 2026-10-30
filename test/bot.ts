import { BALANCE } from '../src/data';
import { Game } from '../src/sim';
import type { Level } from '../src/types';

export { BALANCE, LEVELS } from '../src/data';

/** What the bot builds: [pad, tower type], in order of priority. */
export type BuildPlan = [number, string][];

/**
 * A simple player: it builds the plan strictly in order (saving up for the next one, up to
 * `maxTowers`), then upgrades. It never calls waves early. Used to check that levels are
 * winnable but not free.
 */
export function playBot(level: Level, plan: BuildPlan, seed = 1, maxTowers = plan.length): Game {
  const g = new Game(level, BALANCE, seed);
  const spend = () => {
    let built = g.towers.filter(Boolean).length;
    for (const [pad, type] of plan) {
      if (built >= maxTowers) break;
      if (g.towers[pad]) continue;
      if (!g.build(pad, type)) return; // save up for this one
      built++;
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const [pad] of plan) if (g.towers[pad] && g.upgrade(pad)) changed = true;
    }
  };
  let guard = 0;
  while (!g.isOver() && guard++ < 60 * 60 * 30) {
    spend();
    if (g.wavesStarted === 0) g.callWave();
    g.step();
  }
  return g;
}

/** Tower mix for automatic plans, by how much road the spot covers (best spot first). */
const MIX = ['archer', 'knights', 'catapult', 'wizard', 'archer', 'wizard', 'catapult', 'archer', 'knights', 'archer'];

/** A plan for any level: pads ranked by how much road a 230-unit tower there would cover. */
export function autoPlan(level: Level): BuildPlan {
  const g = new Game(level, BALANCE);
  const cover = (x: number, y: number) =>
    g.paths.reduce((n, p) => n + p.samples.filter((s) => s.x > 0 && s.x < 1600 && Math.hypot(s.x - x, s.y - y) <= 230).length, 0);
  return g.pads
    .map((p, i) => ({ i, c: cover(p.x, p.y) }))
    .sort((a, b) => b.c - a.c)
    .map(({ i }, rank) => [i, MIX[rank % MIX.length]]);
}
