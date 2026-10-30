import { expect, it } from 'vitest';
import { LEVELS, playBot } from './bot';

// Balance guard rails for level 1, played by the simple bot in test/bot.ts.
// The table it prints is the quickest way to see what a balance change did.
const level = LEVELS[0];
const order = [1, 2, 4, 5, 0, 3, 6, 7];

it('level 1: a full defence wins, two towers lose', () => {
  const rows: string[] = [];
  for (const towers of [2, 3, 4, 6, 8]) {
    for (const seed of [1, 2, 3]) {
      const g = playBot(level, order, seed, towers);
      rows.push(`${towers} towers, seed ${seed}: ${g.phase} on wave ${g.wavesStarted}, ${g.lives} lives, ${g.stars()} stars`);
      if (towers === 8) expect(g.phase).toBe('won');
      if (towers === 2) expect(g.phase).toBe('lost');
    }
  }
  console.log(rows.join('\n'));
});
