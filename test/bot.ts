import { BALANCE } from '../src/data';
import { Game } from '../src/sim';
import type { Level } from '../src/types';

export { BALANCE, LEVELS } from '../src/data';

/**
 * A simple player: before each wave it builds on `pads` (in that order) and then upgrades.
 * It never calls waves early. Used to check that levels are winnable but not free.
 */
export function playBot(level: Level, pads: number[], seed = 1, maxTowers = pads.length): Game {
  const g = new Game(level, BALANCE, seed);
  const spend = () => {
    let built = g.towers.filter(Boolean).length;
    for (const p of pads) {
      if (built >= maxTowers) break;
      if (!g.towers[p] && g.build(p, 'archer')) built++;
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const p of pads) if (g.towers[p] && g.upgrade(p)) changed = true;
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
