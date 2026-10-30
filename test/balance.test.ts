import { expect, it } from 'vitest';
import { autoPlan, LEVELS, playBot } from './bot';

// Balance guard rails, played by the simple bot in test/bot.ts with a mixed plan per level:
// a full defence wins every level, two towers lose. The printed table is the quickest way to
// see what a balance change did. Run with `npm run balance`; it is left out of `npm run check`
// so the owner's own tweaks to data/balance.json are never blocked from publishing.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

for (const level of LEVELS) {
  it.skipIf(!env.BALANCE)(`${level.name}: a full defence wins, two towers lose`, () => {
    const plan = autoPlan(level);
    const rows: string[] = [];
    const results: { towers: number; phase: string }[] = [];
    for (const towers of [2, 4, 6, plan.length]) {
      for (const seed of [1, 2, 3]) {
        const g = playBot(level, plan, seed, towers);
        results.push({ towers, phase: g.phase });
        rows.push(`${level.name}, ${towers} towers, seed ${seed}: ${g.phase} on wave ${g.wavesStarted}/${g.totalWaves}, ${g.lives} lives, ${g.stars()} stars`);
      }
    }
    console.log(rows.join('\n'));
    for (const r of results) {
      if (r.towers === plan.length) expect(r.phase).toBe('won');
      if (r.towers === 2) expect(r.phase).toBe('lost');
    }
  });
}
