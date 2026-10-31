// Best stars per level, kept in this browser on the phone. Storage can be missing or blocked
// (private tabs, cleared site data), so every read and write is allowed to fail quietly:
// the game then simply starts with only level 1 unlocked.
import type { HeroAbility, HeroSpec, Level } from './types';

const KEY = 'knights-and-dragons.progress.v1';

/** Level id → best stars (1–3). Levels never won are missing. */
export type Progress = Record<string, number>;

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

/** Remembers `stars` for a level if it beats the best so far; returns the progress after. */
export function saveStars(levelId: string, stars: number): Progress {
  const p = loadProgress();
  if (stars > (p[levelId] ?? 0)) {
    p[levelId] = stars;
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      // Not saved; the stars still show until the page is closed.
    }
  }
  return p;
}

/** The first level is always open; each next one opens once the one before it is won. */
export function isUnlocked(levels: Level[], index: number, p: Progress): boolean {
  return index === 0 || (p[levels[index - 1].id] ?? 0) > 0;
}

const HERO_KEY = 'knights-and-dragons.hero.v1';

/** Hero abilities bought so far. */
export function loadAbilities(): HeroAbility[] {
  try {
    const a = JSON.parse(localStorage.getItem(HERO_KEY) ?? '[]');
    return Array.isArray(a) ? a.filter((x): x is HeroAbility => x === 'rally' || x === 'stomp') : [];
  } catch {
    return [];
  }
}

/** All best stars added up: what the player has earned. */
export function earnedStars(p: Progress): number {
  return Object.values(p).reduce((sum, s) => sum + (Number(s) || 0), 0);
}

/** Stars left to spend after the abilities already bought. */
export function starsToSpend(p: Progress, owned: HeroAbility[], hero: HeroSpec): number {
  return earnedStars(p) - owned.reduce((sum, a) => sum + hero[a].cost, 0);
}

/** Buys an ability if there are enough stars; returns what is owned afterwards. */
export function buyAbility(a: HeroAbility, hero: HeroSpec): HeroAbility[] {
  const owned = loadAbilities();
  if (owned.includes(a) || starsToSpend(loadProgress(), owned, hero) < hero[a].cost) return owned;
  const next = [...owned, a];
  try {
    localStorage.setItem(HERO_KEY, JSON.stringify(next));
  } catch {
    return owned;
  }
  return next;
}

const XP_KEY = 'knights-and-dragons.hero-xp.v1';

/** The hero's experience, kept between battles. */
export function loadHeroXp(): number {
  try {
    const xp = Number(localStorage.getItem(XP_KEY) ?? 0);
    return Number.isFinite(xp) && xp > 0 ? xp : 0;
  } catch {
    return 0;
  }
}

export function saveHeroXp(xp: number): void {
  try {
    localStorage.setItem(XP_KEY, String(Math.floor(xp)));
  } catch {
    // Not saved; the XP still counts for this battle.
  }
}
