import { expect, it } from 'vitest';
import { LEVELS, playBot, type BuildPlan } from './bot';

// Balance guard rails for level 1, played by the simple bot in test/bot.ts.
// The table it prints is the quickest way to see what a balance change did.
const level = LEVELS[0];
const archersOnly: BuildPlan = [4, 2, 0, 6, 3, 1, 5, 7].map((p) => [p, 'archer']);
const withKnights: BuildPlan = [[4, 'archer'], [3, 'knights'], [2, 'archer'], [0, 'archer'], [6, 'archer'], [5, 'knights'], [1, 'archer'], [7, 'archer']];
const mixed: BuildPlan = [[4, 'archer'], [3, 'knights'], [2, 'catapult'], [0, 'wizard'], [6, 'archer'], [5, 'knights'], [1, 'wizard'], [7, 'archer']];

it('level 1: a full defence wins, two towers lose', () => {
  const results: { name: string; towers: number; phase: string }[] = [];
  const rows: string[] = [];
  for (const [name, plan] of [['archers', archersOnly], ['with knights', withKnights], ['all four', mixed]] as const) {
    for (const towers of [2, 3, 4, 6, 8]) {
      for (const seed of [1, 2, 3]) {
        const g = playBot(level, plan, seed, towers);
        results.push({ name, towers, phase: g.phase });
        rows.push(`${name}, ${towers} towers, seed ${seed}: ${g.phase} on wave ${g.wavesStarted}, ${g.lives} lives, ${g.stars()} stars`);
      }
    }
  }
  console.log(rows.join('\n'));
  for (const r of results) {
    if (r.towers === 8 && r.name === 'all four') expect(r.phase).toBe('won');
    if (r.towers === 2) expect(r.phase).toBe('lost');
  }
});
