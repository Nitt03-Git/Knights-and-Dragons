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
  publishes it to https://nitt03-git.github.io/Knights-and-Dragons/. The owner plays it in
  Chrome on Android, ideally added to the home screen (opens full-screen and sideways).
- The owner works from the phone only; Claude writes the code, tests it in a headless browser
  and with a bot player, and the owner plays and gives feedback.
- Mechanics first, art later:
  - **Phase 1 (now):** rules, units, levels and balance, drawn with simple shapes.
  - **Phase 2 (started 0.10):** real art per tower, enemy and hero (only `src/render.ts`
    changes). Towers and trees: Kenney's Castle Kit (CC0). Knights, hero and enemies: the owner
    is looking for a pack.
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
5. **Blocking:** knights go for enemies within 95 units of their flag. Each knight holds one
   enemy (it stops and fights back); spare knights help a fellow knight; enemies that aren't
   held walk past. Flying enemies can't be held. Towers keep shooting held enemies.
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
| Knights' Hall | 3 knights at a movable flag on the road, hold and fight | ✅ 0.3 |
| Wizard Tower | slow, strong magic bolts (ignore armor) | ✅ 0.4 |
| Catapult | slow, splash, physical (armor counts half), can't hit flyers | ✅ 0.4 |

| Enemy | Role | Status |
|---|---|---|
| Kobold Runner | fast, weak, many | ✅ 0.2 |
| Scaled Brute | armored (bowmen struggle) | ✅ 0.2 |
| Bridge Troll | slow, lots of health, costs 3 lives | ✅ 0.2 |
| Hexling | magic-resistant (wizards struggle) | ✅ 0.4 |
| Wyrmling | flying: knights can't hold it, catapults can't hit it | ✅ 0.4 |
| Dragon | boss | later |

## Milestones

Each one is a version the owner can play from the link.

- **0.2 ✅**: one road with lanes, waves from the level file, lives, gold, Bowmen Tower with
  3 levels, selling, calling waves early, win/lose with stars, pause, 2× speed, full-screen
  landscape. Level 1 "Greenhollow Road" balanced with the bot (`test/balance.test.ts`).
- **0.3 ✅**: Knights' Hall (3 levels): 3 knights stand at a flag on the road, each holds one
  enemy and fights it, fallen knights return after a few seconds, idle knights heal. Move the
  flag with the 🚩 button, then tap the road inside the blue circle. Build spots moved after
  the owner's first play (3 of them reached almost no road); enemies a bit tougher to match.
- **0.3.1 ✅** (owner's feedback on 0.3): pinch to zoom (up to 2.5×) and drag to move around;
  drag knights (or their flag) to move the flag; building, upgrading and selling take two taps:
  the first shows the range (and a see-through tower), the second confirms, a tap elsewhere
  cancels. Difficulty stays as it is ("on the hard side", 1 star) until the hero and more
  towers arrive.
- **0.4 ✅**: Wizard Tower and Catapult (3 levels each); Hexlings and Wyrmlings join waves 3–6
  of level 1. Catapult shells aim where the enemy will be when they land. Balance checked
  with the bot: all four tower types together win with 2 stars, archers alone barely win, so
  mixing towers pays off (the owner expected more towers to make it a little easier).
- **0.4.1 ✅**: owner lost on 0.4 and asked for more gold from the tougher enemies: Brute
  16→20, Troll 60→80, Hexling and Wyrmling 14→18 (Kobolds unchanged). Mixed defences of 3–4
  towers now win; a full one still gets 2 stars from the bot.
- **0.5 ✅**: level select with 3 levels; each opens when the one before is won; best stars
  saved in the phone's browser (`src/progress.ts`, localStorage, safe when storage is blocked).
  New: **Twin Fords** (two roads that merge, 7 waves) and **Ember Pass** (long winding road
  walked right to left, 8 waves). Levels may set their own `startGold`. The bot now plays
  every level with an automatic plan (best-covering spots first, mixed towers); full
  defences win levels 2 and 3 with 2 stars but with fewer lives to spare than level 1.
- **0.5.1 ✅**: tuning made easy (owner's wish before the hero and specials arrive): how many
  enemies a knight holds is now a number (`holds`, 1 for now); `TUNING.md` explains every
  number in plain words, with steps to change one on GitHub from the phone. Data mistakes
  (typos, armor above 0.95…) still block publishing; the bot's balance report no longer does
  (`npm run balance`). Owner's stars on 0.5: 1, 3 and 2.
- **0.6 ✅** (owner chose the hero before the Level Studio): the **Mounted Knight**, a knight on
  a horse. Tap it then tap a spot (or drag it) and it rides there and stands guard, holding two
  enemies; it comes back 20 s after falling. Abilities bought with stars on the Hero screen
  (stars = best stars of all levels added up, minus what was spent):
  **Rallying Banner** (5 ★, passive): knights within 160 of the hero take 1/1.2 of the damage,
  i.e. they last 20% longer. **Thundering Hooves** (10 ★): every 15 s, 35 damage (ignores
  armor) to every ground enemy within 90 of the hero. Note: 3 levels give at most 9 stars, so
  the second ability needs a 4th level or a lower price (owner to decide).
  Also: upgrading a Knights' Hall brings fallen knights back straight away (owner's request).
  Retuned for the hero: hero 240 hp; all enemies about 10% more health; full defences win
  with 2 stars again (bot, hero left where it starts, no abilities).
- **0.6.1 ✅**: hero named **Roach the Mounted Knight**; both abilities cost 2 ★ for testing
  (owner's choice; the planned prices are 5 ★ and 10 ★).
- **0.6.2 ✅** (owner's feedback): knights inside the Rallying Banner show a gold glow and a
  gold + ; hero renamed **Roch the Mounted Knight**; hero XP: every enemy Roch defeats (sword
  or stomp) gives XP equal to its gold; levels 2–5 at 60/160/320/550 XP bring more health,
  sword damage and armor, and heal him fully. XP starts again each battle (chosen so levels
  stay balanced; could become permanent later). Level 1 got easier with it (bot: 3 stars
  with 6 towers); levels 2 and 3 barely changed.
- **0.6.3 ✅** (owner's choice): hero XP is **kept forever** (saved on the phone after every
  kill, win or lose), so replaying levels makes Roch stronger. **10 levels**, each half the
  step of the old 5; reaching the old top strength (now level 9) takes 3× the XP (1650).
  Thresholds 90/180/330/480/720/960/1300/1650/2100. A battle gives roughly 100–250 XP with
  Roch left where he starts, more when he is moved into the fights.
- **0.7 ✅**: **Specials** (owner chose them before the Level Studio), usable from the first
  battle, upgraded with stars on the new Specials screen (levels 2–5 cost 3 ★ each, the extra
  at level 5 costs 5 ★):
  **Reinforcements** (shield button, then tap the road): 2 soldiers for 15 s, ready every 25 s;
  levels add health, damage and armor; extra **Sky spears**: they also hit flyers nearby.
  **Arrow Volley** (bow button, then tap anywhere): after 0.8 s, damage to every enemy in a
  circle (flyers too), ready every 45 s; levels add damage and size; extra **Scattered
  volleys**: 3 more small volleys on random spots of the road.
  Note: fully upgrading both costs 34 ★ (+4 for the hero); 3 levels give at most 9.
- **0.7.1 ✅**: testing switch: open once with `?teststars` for 50 extra stars (remembered on
  the phone, `?teststars=0` turns it off). Upgrade prices stay as they are for now.
- **0.7.2 ✅** (owner tested maxed specials): Sky spears now really work: soldiers throw a
  visible spear at the nearest flyer within 150 every 1.5 s for double damage, even while
  fighting. Scattered volleys land near where you aim (within 260, spread apart) instead of
  anywhere on the road. The volley circle grows clearly: 70, 80, 90, 105, 125.
- **0.8 ✅**: **Level Studio** (`src/studio.ts`): draw up to 3 roads with a finger (ends near the
  map edge are pushed off the map), tap to place/remove stone spots (red when breaking the
  level rules), edit name, start gold and waves, start from blank or a copy of a level, Undo,
  Test (plays the draft; no stars or XP), Copy (JSON for `data/levels.json`). Draft kept on the
  phone.
- **0.8.1 ✅**: owner's first studio level **X-Road** (level 4: two roads that cross, 5 waves).
  Changed with the bot: start gold 290 → 380 and the four trolls of wave 5 spaced out (they
  came all at once); the bot then wins with all 8 spots, on 1 star. Studio fix: a finger that
  starts or ends beside the map is cut at the edge, so roads no longer double back at the ends.
- **0.8.2 ✅**: owner played X-Road: too easy with the 0.8.1 changes, so start gold is back to
  290 and the trolls come together again; wave 4's second kobold group now uses the second
  road. Meant to be beaten with the hero and specials: the bot (which uses neither) loses it,
  so `test/balance.test.ts` skips "a full defence wins" for X-Road on purpose.
- **0.9 ✅**: **Look Lab** (`src/lab.ts`, looks in `data/looks.json`, rules in `src/looks.ts`):
  all 12 units and towers animating side by side (Walk / Fight / Hurt / Still, tower level
  1–3, close-up), sliders for size, bounce, speed and sword swing / wing flap, colour pickers.
  Changes are kept on the phone and used by the game there; Copy gives only the changes, to
  paste in the chat. Owner is also looking at Kenney.nl art packs for Phase 2 (Castle Kit).
- **0.10 ✅**: **Kenney towers** (Phase 2 starts). The owner uploaded Kenney's Castle Kit (3D,
  CC0) to the chat; it is kept in `art/castle-kit`. `npm run sprites` (`tools/make-sprites.mjs`,
  pieces in `tools/sprites/recipes.ts`) renders the models with three.js in the preinstalled
  Chromium, from the game's angle, into `public/sprites/*.png` and `src/sprites.json`. Each tower
  has 3 levels (taller and grander), 5 roof colours (purple made from Kenney's blue) and sand or
  grey stone; the catapult's arm is thrown in 5 steps. Trees are Kenney's pines. The Look Lab
  offers Roof and Stone for towers instead of colour pickers. Units are still drawn shapes.
- **0.11 ✅**: **Quaternius knights.** The owner uploaded the Knight Pack (FBX, CC0; in
  `art/knight-pack`). `npm run sprites` renders the animated knight from the game's angle into
  strips of frames: idle (sword ready), walk, fight (jumping sword attack) and death, plus a
  mask of the armour so the game tints it (knights blue, Reinforcements green, Look Lab
  "Armor"). Knights have the visored helmet and long sword, Reinforcements another helmet and
  the short sword. They face the enemy they fight, flash white when hit, and fallen knights
  lie on the road a moment. Look Lab: Fall pose. Roch is still drawn (the pack has no horse).
- **0.12 ✅**: **Quaternius enemies** (owner uploaded; CC0, in `art/monster-pack`): Kobold
  Runner = alien (runs), Hexling = alien in a glass helmet (rendered see-through), Scaled Brute
  = robot (falls apart when it dies), Bridge Troll = zombie, big and slow (no death in the file:
  it sinks and fades; its own colour image wasn't in the upload, so the game colours it). They
  punch or bite while a knight holds them, flash when hit, fall and fade when killed; bodies
  tinted by the Look Lab Body colour. Wyrmling is still drawn. Names and the game's title don't
  fit aliens and robots any more: to decide with the owner later.
- **Next**: a flying enemy and Roch (owner is looking for packs).
- **Later**: branching upgrades, sound, more levels, Phase 3.

## From the Gemini prototype

Kept: the four tower roles, first stat ideas, Chaikin smoothing, the round build menu, and
the "copy level as JSON" editor idea.

Not kept: one big HTML file, the Tailwind CDN, 0–1 coordinates, "true" damage, and names and
wording borrowed from other games.

## Owner's wishes for later

- Knights should look very different (Phase 2 art), not just recoloured shapes.
- Difficulty gets retuned once the hero (and specials) are in.

## Open questions for the owner

- Stars: upgrades cost far more than the levels can give (4 levels: 12 ★) (prices kept for now; test stars meanwhile).
- Ability prices after testing (planned 5 ★ and 10 ★; 4 levels give at most 12 ★).
- How many levels for a first "complete" version?
