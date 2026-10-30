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

- Tap a grey stone spot to build a tower. Tap a tower to upgrade or sell it.
- Tap **⚔ Start wave 1** when you're ready. Later waves start by themselves; calling them
  early gives bonus gold.
- Each enemy that reaches the end of the road costs lives. Win with 18+ lives left for 3 stars.
- **1×/2×** changes the speed, **❚❚** pauses.

## Privacy

The game collects nothing and contacts nothing besides this website (fonts are included).
It needs no permissions.

## Building (for developers)

```
npm install
npm run dev      # local server
npm run check    # type check and tests (includes a bot that plays level 1)
npm run build    # production build in dist/
```

Plan and milestones: [PLAN.md](PLAN.md).
