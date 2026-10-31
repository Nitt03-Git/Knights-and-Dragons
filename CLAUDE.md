# Knights & Dragons

Original fantasy tower-defense web game, played in Chrome on the owner's Android phone. The
owner is not a developer and works **from their phone only**: explain things in plain language,
in numbered steps. This is their first game; be honest and critical when asked.

Full plan, decisions and milestones: `PLAN.md` (keep it up to date when the owner changes the plan).

## Rules

- The owner may edit `data/*.json` directly on GitHub: `git pull` before starting work.
- Every push runs `.github/workflows/pages.yml` (type check, tests, build). Pushes to `main`
  publish to https://nitt03-git.github.io/Knights-and-Dragons/. After pushing, check the
  Actions run is green, then tell the owner what to try on the phone.
- You can run the game yourself: `npx vite build && npx vite preview`, then drive it with the
  preinstalled Playwright at a phone landscape viewport (e.g. 915×412, `isMobile`, `hasTouch`).
  `?debug` exposes `window.debug.game`. Look at screenshots before saying something works.
- Bump `VERSION` in `src/main.ts` (and `package.json`) per milestone; the build number is the
  Actions run number.
- Our own game: no names, art, levels or wording from existing games.
- `src/sim.ts` is the rules only (no DOM, no drawing, fixed 1/60 s steps, seeded random).
  `src/render.ts` only draws; `src/main.ts` is the screen, input and loop.
- Stats and rules live in `data/balance.json`, levels in `data/levels.json` (world units,
  map 1600×900, landscape). After a balance or level change, run `npm run balance` and read
  the bot table (`test/balance.test.ts`); keep its guard rails passing or change them on
  purpose and say why. It is not part of `npm run check` on purpose: the owner may tweak
  `data/balance.json` on GitHub (see `TUNING.md`) and that must never be blocked from
  publishing by the bot. Data sanity checks (ranges, known enemies, pads) do run in `check`.
- Levels from the Level Studio arrive as pasted JSON: add the object to `data/levels.json`
  (keep its style, give it a unique `id`), move any stone spot the tests reject, run
  `npm run check` and `npm run balance`, and tell the owner how the bot did on it.
- Looks from the Look Lab arrive as pasted JSON with only the changes: merge them into
  `data/looks.json` (keep one line per unit), run `npm run check`, and screenshot the units.
- Art (Phase 2): towers and trees come from Kenney's Castle Kit in `art/castle-kit` (CC0).
  Change which pieces make which picture in `tools/sprites/recipes.ts`, then `npm run sprites`
  and commit `public/sprites` and `src/sprites.json`. Any new art needs a licence that allows
  use in a game; keep its licence file next to it and credit it in README's Art section.
- No network calls, no trackers, no external scripts or fonts (fonts are bundled via
  @fontsource). README's privacy section must stay true.

## Stack

TypeScript 7, Vite 8, Vitest 5, Node 22, canvas 2D, no game framework. Versions in `package.json`.
