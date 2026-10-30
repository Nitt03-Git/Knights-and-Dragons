# Knights & Dragons: plan

Started 2026-10-30 from the owner's first spec (written with Gemini) and a Gemini HTML prototype.
This file is the source of truth for what we're building; update it when the owner changes the plan.

## The game

The dragon's horde marches down the kingdom's roads: kobolds, scaled brutes, trolls, flying
wyrmlings and, in the end, dragons. You hold the road with towers built on fixed stone spots.
Knights step onto the road and hold enemies in place, while bowmen, wizards and catapults hit
them. Lose too many lives and the horde breaks through.

It's an original game in the tower-defense genre: our own world, names, units, maps and art.
Other games in the genre are a reference for *feel* only.

## How we work

- It's a web game (TypeScript on an HTML canvas, built with Vite). Every push to `main`
  publishes it to https://nitt03-git.github.io/knights-and-dragons/. The owner plays it in
  Chrome on Android, ideally added to the home screen (opens full-screen and sideways).
- The owner works from the phone only; Claude writes the code, tests it in a headless browser
  and with a bot player, and the owner plays and gives feedback.
- Mechanics first, art later:
  - **Phase 1 (now):** rules, units, levels and balance, drawn with simple shapes.
  - **Phase 2:** real art per tower, enemy and hero (only `src/render.ts` changes).
  - **Phase 3:** a painted background per level, drawn on the level's 1600×900 map.

## Decisions (what changed from the first spec, and why)

1. **Fixed map size instead of 0–1 coordinates.** Every level is 1600×900 "world units",
   landscape, scaled to fit the screen; grass and roads continue past the edges on wider screens.
   0–1 coordinates stretch round bends into ovals on wide phones, and a painted background
   (Phase 3) can't line up with them.
2. **Game rules separate from drawing.** `src/sim.ts` has no drawing in it and runs 60 fixed
   steps per second, so 2× speed and slow phones give the same result, and tests can play it.
3. **Two damage types, both percentages.** Physical damage is reduced by armor, magic damage
   by magic resistance (0 = none, 0.5 = half). "True damage" isn't used. The catapult is
   physical, but armor counts for half against it.
4. **Towers shoot the enemy in range that is furthest along its road.** (Target choices may
   come later.)
5. **Blocking:** each knight holds one enemy; enemies that aren't held walk past. Flying
   enemies can't be held.
6. **Roads:** a level has one or more roads, drawn as a few control points, smoothed by
   corner-cutting (Chaikin) and resampled evenly. Each road has 3 side-by-side lanes so
   enemies spread out.
7. **Economy:** start gold, gold per kill, tower costs, selling gives back 70% of what was
   spent, and calling the next wave early pays 1 gold per second left on the clock.
   Leaks cost lives (big enemies cost more). Stars: 3 with 18+ lives left, 2 with 10+, else 1.
8. **Upgrades:** each tower has 3 levels for now; branching upgrades come later.
9. **Data in files:** unit stats and rules in `data/balance.json`, levels (roads, build spots,
   waves) in `data/levels.json`.

## Units

| Tower | Role | Status |
|---|---|---|
| Bowmen Tower | fast single shots, physical | ✅ 0.2 |
| Knights' Hall | 3 knights at a movable rally flag, block and fight | 0.3 |
| Wizard Tower | slow, strong magic bolts | 0.4 |
| Catapult | very slow, splash, physical (half armor) | 0.4 |

| Enemy | Role | Status |
|---|---|---|
| Kobold Runner | fast, weak, many | ✅ 0.2 |
| Scaled Brute | armored (bowmen struggle) | ✅ 0.2 |
| Bridge Troll | slow, lots of health, costs 3 lives | ✅ 0.2 |
| Hexling | magic-resistant (wizards struggle) | 0.4 |
| Wyrmling | flying: knights can't hold it, catapults can't hit it | 0.4 |
| Dragon | boss | later |

## Milestones

Each one is a version the owner can play from the link.

- **0.2 ✅**: one road with lanes, waves from the level file, lives, gold, Bowmen Tower with
  3 levels, selling, calling waves early, win/lose with stars, pause, 2× speed, full-screen
  landscape. Level 1 "Greenhollow Road" balanced with the bot (`test/balance.test.ts`).
- **0.3**: Knights' Hall: knights walk to a rally flag on the road, hold enemies, fight,
  respawn. Move the flag by tapping the road.
- **0.4**: Wizard Tower and Catapult; Hexling and Wyrmling.
- **0.5**: level select with 3 levels; stars saved on the phone.
- **0.6**: Level Studio: draw a road with a finger, place build spots, set waves, then
  "Copy level" and paste it into the chat so Claude adds it to `data/levels.json`.
- **0.7**: Hero: a knight champion you move by tapping, with 1–2 abilities.
- **Later**: branching upgrades, sound, more levels, then Phase 2 and Phase 3.

## From the Gemini prototype

Kept: the four tower roles, first stat ideas, Chaikin smoothing, the round build menu, and
the "copy level as JSON" editor idea.

Not kept: one big HTML file, the Tailwind CDN, 0–1 coordinates, "true" damage, and names and
wording borrowed from other games.

## Open questions for the owner

- Should the hero be a knight, or someone else (a dragon tamer?) — decide before 0.7.
- How many levels for a first "complete" version?
