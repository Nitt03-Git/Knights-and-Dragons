import balanceJson from '../data/balance.json';
import levelsJson from '../data/levels.json';
import type { Balance, Level } from './types';

// The JSON files are checked by test/sim.test.ts; here they are just given their types.
export const BALANCE = balanceJson as unknown as Balance;
export const LEVELS = levelsJson.levels as unknown as Level[];
