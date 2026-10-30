// Best stars per level, kept in this browser on the phone. Storage can be missing or blocked
// (private tabs, cleared site data), so every read and write is allowed to fail quietly:
// the game then simply starts with only level 1 unlocked.
import type { Level } from './types';

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
