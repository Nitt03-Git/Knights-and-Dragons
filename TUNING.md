# Tuning the game

Every number that decides how hard the game is lives in two files:

- [`data/balance.json`](data/balance.json): gold, lives, towers, knights and enemies.
- [`data/levels.json`](data/levels.json): each level's roads, stone spots, starting gold and waves.

You can ask Claude to change any of them ("give Brutes 250 health"), or change them yourself
on GitHub (steps at the bottom). Nothing else needs to change: the game reads these files.

## Gold and lives (`balance.json` → `rules`)

| Name | What it does | Now |
|---|---|---|
| `startGold` | Gold at the start of a level (a level can override it, see below) | 240 |
| `lives` | Lives at the start | 20 |
| `sellRefund` | Share of what you spent that selling gives back (0.7 = 70%) | 0.7 |
| `waveGap` | Seconds before the next wave starts by itself | 25 |
| `earlyBonusPerSecond` | Gold per second left when you call a wave early | 1 |
| `starLives` | Lives needed for 3 stars and for 2 stars | 18, 10 |

Each level in `levels.json` can have its own `"startGold"`.

## Towers (`balance.json` → `towers`)

Each tower has a list of `levels`: level 1 first, then the upgrades.

| Name | What it does |
|---|---|
| `cost` | Gold to build (level 1) or to upgrade to this level |
| `range` | How far it reaches. The map is 1600 wide; 230 is about a seventh of it |
| `cooldown` | Seconds between shots (lower = faster) |
| `damage` | Damage per hit: `[lowest, highest]`, each hit is somewhere in between |
| `damageType` | `"physical"` (armor reduces it) or `"magic"` (magic resistance reduces it) |
| `splash` | Catapult only: how wide the stone's hit is |
| `armorPierce` | Share of armor ignored (0.5 = armor counts half) |

## Knights (`balance.json` → `towers` → `knights`)

For the Knights' Hall, `damage` and `cooldown` are each knight's sword blows, `range` is how
far from the hall the flag may go, and `unit` describes the knights:

| Name | What it does | Level 1 now |
|---|---|---|
| `count` | Knights per hall | 3 |
| `hp` | Health of each knight | 60 |
| `armor` | Share of enemy blows blocked (0.2 = 20%) | 0.2 |
| `holds` | How many enemies one knight holds in place at once | 1 |
| `respawn` | Seconds before a fallen knight returns | 10 |
| `regen` | Health per second regained while not fighting | 6 |
| `speed` | Walking speed | 90 |

## The hero (`balance.json` → `hero`)

| Name | What it does | Now |
|---|---|---|
| `name` | Shown on the Hero screen | Roch the Mounted Knight |
| `hp`, `armor`, `regen`, `respawn`, `speed`, `holds` | As for knights (`hp` and `armor` at level 1) | 240, 0.3, 8, 20, 150, 2 |
| `damage`, `cooldown` | Its sword blows | [10, 15], 0.9 |
| `engageRange` | How far from where it stands it rides out to fight | 100 |
| `rally.cost` / `stomp.cost` | Stars to buy each ability (2 each while testing) | 2 / 2 |
| `rally.radius`, `rally.hpBoost` | Rallying Banner: reach, and how much longer knights last (0.2 = 20%) | 160, 0.2 |
| `stomp.every`, `stomp.damage`, `stomp.radius` | Thundering Hooves: seconds between stamps, damage, reach | 15, 35, 90 |

**Hero levels** (`hero` → `levels`): the hero earns XP equal to the gold of each enemy it
defeats itself, and keeps it between battles (saved on the phone). Each entry is the next
level: `xp` is the total XP needed, then that level's `hp`, `damage` and `armor`. Level 1 uses
the hero's own numbers above. Now 10 levels: 2 at 90 XP, 3 at 180, 4 at 330, 5 at 480, 6 at 720,
7 at 960, 8 at 1300, 9 at 1650, 10 at 2100.

Each level in `levels.json` can also set `"heroStart": [x, y]`, where the hero begins.

## Specials (`balance.json` → `specials`)

Both specials start at level 1 and are upgraded with stars on the Specials screen.

| Name | What it does | Now |
|---|---|---|
| `cooldown` | Seconds before it can be used again | 25 / 45 |
| `upgradeCost` | Stars for each next level (2 to 5) | 3 |
| `extraCost` | Stars for the extra, once at level 5 | 5 |
| `extraName` | Name of the extra | Sky spears / Scattered volleys |

**Reinforcements** (`reinforce`): `count` soldiers (2) stay `duration` seconds (15) on the
road, walk at `speed`, strike every `attackCooldown` seconds and hold `holds` enemies each.
`levels` gives each level's `hp`, `damage` and `armor`. With the extra (Sky spears) each
soldier also throws a spear at the nearest flyer within `skyReach` (150), one every
`skyCooldown` seconds (1.5), for `skyDamage` (2) times its sword damage, even while fighting.

**Arrow Volley** (`volley`): lands `delay` seconds (0.8) after the tap. `levels` gives each
level's `damage` and `radius` (how big the circle is: 70, 80, 90, 105, 125). The extra adds
`extraSpots` (3) smaller volleys of size `extraRadius` (55) on random spots of the road within
`extraSpread` (260) of where you aimed, spread apart from each other.

## Enemies (`balance.json` → `enemies`)

| Name | What it does |
|---|---|
| `hp` | Health |
| `speed` | Walking speed (70 crosses the map in about 23 seconds) |
| `armor` | Share of physical damage blocked, 0 to 0.95 (0.3 = 30%) |
| `magicResist` | Share of magic damage blocked, 0 to 0.95 |
| `bounty` | Gold you get for defeating it |
| `lifeCost` | Lives lost when it gets through |
| `attack` | Damage per blow against a knight: `[lowest, highest]` |
| `attackCooldown` | Seconds between its blows |
| `flying` | `true`: flies (knights can't hold it, catapults can't hit it) |
| `size` | How big it is drawn (also where arrows aim) |

## Waves (`levels.json` → a level → `waves`)

Each wave is a list of groups that start together:

```
{ "enemy": "brute", "count": 6, "interval": 1.5, "delay": 3, "path": 1 }
```

`count` enemies of that type, one every `interval` seconds, starting `delay` seconds into the
wave (0 when left out), on road number `path` (0 is the first road; Twin Fords has 0 and 1).

## Test stars

To try upgrades without earning the stars, open the game once in Chrome with `?teststars` at
the end of the address:
https://nitt03-git.github.io/Knights-and-Dragons/?teststars
You get 50 extra stars to spend. The phone remembers it (also in the home-screen app) until
you open https://nitt03-git.github.io/Knights-and-Dragons/?teststars=0 . The level screen
shows a note while it's on. Turning it off takes the 50 away again; upgrades already bought
stay, so stars to spend can then be below zero until you earn more.

## Looks (`looks.json`)

How each unit and tower looks. Easiest to change in the game's **🎨 Looks** screen and paste to
Claude, but you can also edit the file.

| Setting | What it does |
|---|---|
| `size` | How big it is drawn, 1 = normal (0.6 to 1.6). Only the picture: hitting and range stay the same. |
| `bounce` | How high it bobs while walking or flying (0 to 3). |
| `speed` | How fast legs, wings and sword move (0.3 to 3). Not how fast it walks: that is `speed` in `balance.json`. |
| `swing` | How far the sword swings; for the Wyrmling, how far the wings flap (0 to 2.5). |
| `colors` | Colours as `#rrggbb`. Darker shades (stone sides, horse legs, visors) follow on their own. |

## Changing a number yourself on GitHub

1. In Chrome, open https://github.com/Nitt03-Git/Knights-and-Dragons/blob/main/data/balance.json
   (turn on "Desktop site" in the ⋮ menu if the page is cramped).
2. Tap the ✏️ pencil (Edit this file).
3. Change only the number. Keep the commas, quotes and brackets exactly as they are.
4. Tap **Commit changes…**, keep "Commit directly to the main branch", tap **Commit changes**.
5. Wait 1–2 minutes, then close and reopen the game: the build number bottom-left goes up.
6. If the build number doesn't change after 5 minutes, the change had a typo or a number out of
   range (for example armor above 0.95) and was not published. Open the repository's
   **Actions** tab to see the red ✗, or just tell Claude.
