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
