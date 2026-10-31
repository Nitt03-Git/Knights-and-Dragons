# Knights & Dragons

A fantasy tower-defense game for your phone's browser. Hold the road against the dragon's
horde with towers built on stone spots.

**Play:** https://nitt03-git.github.io/Knights-and-Dragons/

## Install on your phone

1. Open the link above in Chrome on Android.
2. Tap the ⋮ menu, then **Add to Home screen** (or **Install app**).
3. Open it from the new icon: it starts full-screen and sideways.

## Updates

Every change is published automatically a minute or two after it's made. Close the game and
open it again to get the newest version (the version and build number are shown bottom-left).
If it still shows an older build, wait a few minutes: GitHub Pages caches the page for up to
10 minutes.

## How to play

- Tap a grey stone spot to build. Tap a building to upgrade or sell it.
  - **Bowmen**: quick arrows. Weak against armor.
  - **Knights' Hall**: three knights hold enemies on the road. Can't stop flyers.
  - **Wizard Tower**: slow, strong magic that ignores armor. Weak against Hexlings.
  - **Catapult**: slow stones that hit groups. Can't hit flyers.
- Building, upgrading and selling take two taps: the first shows how far the tower reaches,
  the second (on the ✔) confirms. Tap anywhere else to cancel.
- To move the knights, drag them (or their flag) to another part of the road. Or tap their
  hall, then **🚩 Move flag**, then tap the road inside the blue circle.
- Pinch to zoom in and out; drag the map to look around when zoomed in.
- **Specials** (round buttons bottom-left): 🛡️ Reinforcements, then tap the road, brings two
  soldiers for a while; 🏹 Arrow Volley, then tap anywhere, rains arrows on that spot. Each
  shows a countdown while it recharges. Upgrade them with stars: **✨ Specials** on the level
  screen.
- Your **hero**, a knight on a horse: tap it, then tap where it should ride (or drag it
  there). The 🐴 button bottom-left shows its level, health and experience, and also selects
  it. Every enemy the hero defeats gives experience, kept between battles; new levels (up
  to 10) make it stronger, so replaying levels pays off. Spend the stars you
  win on its abilities: **🐴 Hero** on the level screen.
- Pick a level. Each level opens once you've won the one before; your best stars are kept on
  this phone (clearing Chrome's site data for the game resets them).
- Tap **⚔ Start wave 1** when you're ready. Later waves start by themselves; calling them
  early gives bonus gold.
- Each enemy that reaches the end of the road costs lives. Win with 18+ lives left for 3 stars.
- **1×/2×** changes the speed, **❚❚** pauses.

## Level Studio: make your own levels

1. On the level screen, tap **🛠️ Studio**.
2. **✏️ Road**: drag your finger from where enemies come in to where they leave. Start and end
   at the map's edge (the dashed line); a green arrow shows the way they walk. Up to 3 roads;
   tap a road to remove it.
3. **🪨 Spots**: tap to add stone spots, tap one to remove it. Red ones are too close to a road,
   another spot or the edge; move them before sending the level.
4. **🌊 Waves**: name the level, set the starting gold, and edit the waves (which enemies, how
   many, how fast, after how many seconds, on which road). You can also start over from a blank
   map or a copy of an existing level. **↩️ Undo** takes back the last change.
5. **▶️ Test** plays your level right away (no stars or hero XP). Pause → **Studio** to go back.
6. **📋 Copy**, then paste the text in the chat with Claude: it becomes a real level.

Your draft is kept on the phone, so you can stop and come back later.

## Look Lab: change how things look

1. On the level screen, tap **🎨 Looks**. Every unit and tower stands there, moving.
2. Tap one (or pick it from the list at the top right) to change it: **Size**, **Bounce** (how
   high it bobs), **Speed** (how fast legs, wings and swords move), **Sword swing** (or **Wing
   flap**) and its colours.
3. **Walk / Fight / Hurt / Still** shows everyone in that pose. For towers, **Shoot** and
   **Level 1–3**. **🔍 Close-up** shows the chosen one large.
4. Your changes are used in the game on this phone straight away. A ✏️ in the list marks the
   ones you changed; **↺ Back to the game's look** undoes one, **↺ All** undoes everything.
5. **📋 Copy**, then paste the text in the chat with Claude to make your looks everyone's.

## Privacy

The game collects nothing and contacts nothing besides this website (fonts are included).
It needs no permissions. Your stars, upgrades, hero experience, Studio draft and Look Lab
changes are stored only in your phone's browser.

## Art

- Towers and trees: [Castle Kit](https://kenney.nl/assets/castle-kit) by Kenney (CC0), in
  `art/castle-kit`.
- Knights and Reinforcements: [Knight Pack](https://quaternius.com/packs/knightcharacter.html)
  by Quaternius (CC0), in `art/knight-pack`.
- Enemies (alien, alien with helmet, robot, zombie): low-poly models by Quaternius (CC0), in
  `art/monster-pack`.

All are free to use. `npm run sprites` turns the 3D models into the game's pictures.

## Building (for developers)

```
npm install
npm run dev      # local server
npm run check    # type check and tests (includes a bot that plays level 1)
npm run build    # production build in dist/
npm run sprites  # remake public/sprites from art/castle-kit (needs Playwright's Chromium)
```

Plan and milestones: [PLAN.md](PLAN.md). Every gameplay number and how to change it: [TUNING.md](TUNING.md).
