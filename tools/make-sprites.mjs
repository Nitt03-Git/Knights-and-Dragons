// Renders the game's pictures from Kenney's 3D models: `npm run sprites`.
// Starts Vite on this folder, opens tools/sprites in the preinstalled Chromium, and writes each
// picture to public/sprites plus src/sprites.json (sizes and ground points, in game units).
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
// The Chromium and Playwright that come with the Claude Code cloud machine.
const { chromium } = createRequire(import.meta.url)('playwright');

/** Game units per model unit, and pixels per game unit in the pictures. */
const WORLD_PER_UNIT = 50;
const PX = 150;
const PX_PER_WORLD = PX / WORLD_PER_UNIT;

const only = process.argv.slice(2);
const server = await createServer({ root: process.cwd(), server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const { RECIPES } = await server.ssrLoadModule('/tools/sprites/recipes.ts');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(e.message));
await page.goto('http://localhost:5199/tools/sprites/index.html');
await page.waitForFunction(() => window.ready);

mkdirSync('public/sprites', { recursive: true });
const manifest = {};
for (const r of RECIPES) {
  if (only.length && !only.some((o) => r.name.startsWith(o))) continue;
  const s = await page.evaluate((rec) => window.renderRecipe(rec), r);
  writeFileSync(`public/sprites/${r.name}.png`, Buffer.from(s.dataUrl.split(',')[1], 'base64'));
  const round = (n) => Math.round((n / PX_PER_WORLD) * 10) / 10;
  manifest[r.name] = { w: round(s.w), h: round(s.h), ax: round(s.ax), ay: round(s.ay) };
  console.log(r.name, `${s.w}×${s.h}px`);
}
if (!only.length) writeFileSync('src/sprites.json', JSON.stringify(manifest, null, 0).replace(/\},"/g, '},\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, '\n}') + '\n');
await browser.close();
await server.close();

// 256 colours per picture: about 7 times smaller, and it looks the same. Needs Python with Pillow.
const shrink = spawnSync('python3', ['-c', `
import glob, sys
from PIL import Image
for f in glob.glob('public/sprites/*.png'):
    im = Image.open(f)
    if im.mode == 'P':
        continue
    im.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(f, optimize=True)
`], { stdio: 'inherit' });
if (shrink.status !== 0) console.warn('Pictures not shrunk (python3 with Pillow missing); they still work.');
