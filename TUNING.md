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
| `name` | Shown on the Hero screen | Roach the Mounted Knight |
| `hp`, `armor`, `regen`, `respawn`, `speed`, `holds` | As for knights | 240, 0.3, 8, 20, 150, 2 |
| `damage`, `cooldown` | Its sword blows | [10, 15], 0.9 |
| `engageRange` | How far from where it stands it rides out to fight | 100 |
| `rally.cost` / `stomp.cost` | Stars to buy each ability (2 each while testing) | 2 / 2 |
| `rally.radius`, `rally.hpBoost` | Rallying Banner: reach, and how much longer knights last (0.2 = 20%) | 160, 0.2 |
| `stomp.every`, `stomp.damage`, `stomp.radius` | Thundering Hooves: seconds between stamps, damage, reach | 15, 35, 90 |

Each level in `levels.json` can also set `"heroStart": [x, y]`, where the hero begins.

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
