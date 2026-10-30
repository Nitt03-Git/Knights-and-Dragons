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
- Your **hero**, a knight on a horse: tap it, then tap where it should ride (or drag it
  there). The 🐴 button bottom-left shows its health and also selects it. Spend the stars you
  win on its abilities: **🐴 Hero** on the level screen.
- Pick a level. Each level opens once you've won the one before; your best stars are kept on
  this phone (clearing Chrome's site data for the game resets them).
- Tap **⚔ Start wave 1** when you're ready. Later waves start by themselves; calling them
  early gives bonus gold.
- Each enemy that reaches the end of the road costs lives. Win with 18+ lives left for 3 stars.
- **1×/2×** changes the speed, **❚❚** pauses.

## Privacy

The game collects nothing and contacts nothing besides this website (fonts are included).
It needs no permissions. Your stars are stored only in your phone's browser.

## Building (for developers)

```
npm install
npm run dev      # local server
npm run check    # type check and tests (includes a bot that plays level 1)
npm run build    # production build in dist/
```

Plan and milestones: [PLAN.md](PLAN.md). Every gameplay number and how to change it: [TUNING.md](TUNING.md).
