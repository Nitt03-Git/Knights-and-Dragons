// Best stars per level, kept in this browser on the phone. Storage can be missing or blocked
// (private tabs, cleared site data), so every read and write is allowed to fail quietly:
// the game then simply starts with only level 1 unlocked.
import type { Balance, HeroAbility, HeroSpec, Level, SpecialKind, SpecialProgress } from './types';

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

/** Stars left to spend after hero abilities and special upgrades already bought. */
export function starsToSpend(p: Progress, owned: HeroAbility[], hero: HeroSpec, specials?: Specials, balance?: Balance): number {
  const heroCost = owned.reduce((sum, a) => sum + hero[a].cost, 0);
  return earnedStars(p) - heroCost - (specials && balance ? specialsSpent(specials, balance) : 0);
}

/** Buys an ability if there are enough stars; returns what is owned afterwards. */
export function buyAbility(a: HeroAbility, balance: Balance): HeroAbility[] {
  const hero = balance.hero;
  const owned = loadAbilities();
  if (owned.includes(a) || starsToSpend(loadProgress(), owned, hero, loadSpecials(), balance) < hero[a].cost) return owned;
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

const SPECIALS_KEY = 'knights-and-dragons.specials.v1';

export type Specials = Record<SpecialKind, SpecialProgress>;

const FRESH: Specials = { reinforce: { level: 1, extra: false }, volley: { level: 1, extra: false } };

/** How far each special is upgraded (both start at level 1, usable from the first battle). */
export function loadSpecials(): Specials {
  try {
    const s = JSON.parse(localStorage.getItem(SPECIALS_KEY) ?? 'null');
    const read = (k: SpecialKind): SpecialProgress => ({
      level: Math.max(1, Math.min(5, Number(s?.[k]?.level) || 1)),
      extra: s?.[k]?.extra === true,
    });
    return { reinforce: read('reinforce'), volley: read('volley') };
  } catch {
    return structuredClone(FRESH);
  }
}

/** Stars spent on special upgrades. */
export function specialsSpent(specials: Specials, balance: Balance): number {
  return (['reinforce', 'volley'] as const).reduce((sum, k) => {
    const spec = balance.specials[k];
    return sum + (specials[k].level - 1) * spec.upgradeCost + (specials[k].extra ? spec.extraCost : 0);
  }, 0);
}

/** What the next upgrade of a special is and costs: a level, the extra, or nothing (null). */
export function nextSpecialUpgrade(k: SpecialKind, specials: Specials, balance: Balance): { kind: 'level' | 'extra'; cost: number } | null {
  const spec = balance.specials[k];
  const s = specials[k];
  if (s.level < spec.levels.length) return { kind: 'level', cost: spec.upgradeCost };
  if (!s.extra) return { kind: 'extra', cost: spec.extraCost };
  return null;
}

/** Buys the next upgrade of a special if there are enough stars; returns the specials afterwards. */
export function upgradeSpecial(k: SpecialKind, balance: Balance): Specials {
  const specials = loadSpecials();
  const next = nextSpecialUpgrade(k, specials, balance);
  if (!next || starsToSpend(loadProgress(), loadAbilities(), balance.hero, specials, balance) < next.cost) return specials;
  const after = structuredClone(specials);
  if (next.kind === 'level') after[k].level++;
  else after[k].extra = true;
  try {
    localStorage.setItem(SPECIALS_KEY, JSON.stringify(after));
  } catch {
    return specials;
  }
  return after;
}
