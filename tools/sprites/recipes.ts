// Which Kenney pieces (art/castle-kit) make which game picture. Run `npm run sprites` after
// changing this; it writes public/sprites/*.png and src/sprites.json.

export interface Recipe {
  /** File name in public/sprites, without .png. */
  name: string;
  /** Models from art/castle-kit, stacked bottom to top. */
  parts: string[];
  /** Colour set: a key of TEXTURES in render.ts. */
  texture?: string;
  /** Turn a named part of the model, e.g. the catapult's arm. */
  turn?: { node: string; axis: 'x' | 'y' | 'z'; angle: number }[];
  /** Extra models placed on top of the stack (flags), offset in model units. */
  top?: { part: string; x?: number; y?: number; z?: number; turn?: number }[];
  scale?: number;
}

/** Roof colours and stone kinds a tower can have (the Look Lab offers these). */
export const ROOFS = ['blue', 'red', 'green', 'yellow', 'purple'] as const;
export const STONES = ['sand', 'grey'] as const;

/** Each tower's three levels: taller and grander as it is upgraded. */
const TOWERS: Record<string, Omit<Recipe, 'name' | 'texture'>[]> = {
  archer: [
    { parts: ['tower-hexagon-base', 'tower-hexagon-top-wood'], top: [{ part: 'flag-pennant', y: -0.3 }] },
    { parts: ['tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-top-wood'], top: [{ part: 'flag-pennant', y: -0.3 }] },
    { parts: ['tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-top-wood'], top: [{ part: 'flag-pennant', x: -0.2, y: -0.3 }, { part: 'flag-pennant', x: 0.2, y: -0.3 }] },
  ],
  knights: [
    { parts: ['tower-square-mid-door', 'tower-square-top-roof'] },
    { parts: ['tower-square-base-border', 'tower-square-mid-door', 'tower-square-top-roof'] },
    { parts: ['tower-square-base-color', 'tower-square-mid-door', 'tower-square-top-roof'], top: [{ part: 'flag', y: -0.05 }] },
  ],
  wizard: [
    { parts: ['tower-square-base', 'tower-square-top-roof-high'] },
    { parts: ['tower-square-base', 'tower-square-mid-windows', 'tower-square-top-roof-high'] },
    { parts: ['tower-square-base', 'tower-square-mid-windows', 'tower-square-top-roof-high-windows'] },
  ],
};

/** Catapult arm, from loaded (0) to fully thrown. */
export const CATAPULT_FRAMES = [0, -0.35, -0.7, -1.0, -1.3];

const recipes: Recipe[] = [];
for (const [type, levels] of Object.entries(TOWERS)) {
  levels.forEach((r, level) => {
    for (const roof of ROOFS) for (const stone of STONES) recipes.push({ ...r, name: `${type}-${level}-${roof}-${stone}`, texture: `${roof}-${stone}` });
  });
}
for (const roof of ROOFS) {
  CATAPULT_FRAMES.forEach((angle, f) => {
    recipes.push({ name: `catapult-${f}-${roof}`, parts: ['siege-catapult'], texture: `${roof}-sand`, turn: [{ node: 'catapult', axis: 'z', angle }], scale: 1 });
  });
}
recipes.push(
  { name: 'tree-large', parts: ['tree-large'], scale: 0.75 },
  { name: 'tree-small', parts: ['tree-small'], scale: 0.75 },
  { name: 'rocks-large', parts: ['rocks-large'], scale: 0.5 },
  { name: 'rocks-small', parts: ['rocks-small'], scale: 0.5 },
);

export const RECIPES = recipes;

// ---- Characters: Quaternius' Knight Pack (art/knight-pack, CC0) ----

const KNIGHT = '/art/knight-pack/KnightCharacter.fbx';
const kit = (helmet: string, sword: string) => [
  { file: `/art/knight-pack/${helmet}.fbx`, bone: 'Head', offset: [0, 110, 0], rotation: [0, 90, 0] },
  { file: `/art/knight-pack/${sword}.fbx`, bone: 'PalmR', rotation: [90, 0, 0] },
  { file: '/art/knight-pack/ShoulderPads.fbx', bone: 'Torso', offset: [0, 40, 0] },
];
/** n evenly spaced moments in an animation of `length` seconds. */
const moments = (length: number, n: number) => Array.from({ length: n }, (_, i) => Math.round(((i * length) / n) * 1000) / 1000);

/** The game's animations: name, the file's animation, its length and how many pictures. */
export const ANIMS: [string, string, number, number][] = [
  ['idle', 'Idle_swordRight', 3.33, 6],
  ['walk', 'Walking', 1.25, 8],
  ['fight', 'swordAttackJump', 1.17, 7],
  ['death', 'Death', 1.42, 6],
];

const UNITS = [
  { name: 'knight', props: kit('Helmet1', 'Sword') },
  { name: 'soldier', props: kit('Helmet2', 'ShortSword') },
];

/** Characters face left (the game mirrors them to face right); the armour is tinted in the game. */
const KNIGHTS = UNITS.flatMap((u) =>
  ANIMS.map(([anim, clip, length, n]) => ({
    name: `${u.name}-${anim}`,
    model: KNIGHT,
    height: 0.8,
    anim: clip,
    times: moments(length, n),
    facing: 180,
    props: u.props,
    colors: { Armor: '#dfe4ec', Skin: '#e0a87c', Boots: '#5a3a22' },
    mask: 'Armor',
  })),
);

// ---- Enemies: Quaternius' monsters (art/monster-pack, CC0), named after the enemy they play ----

interface EnemyArt {
  type: string;
  model: string;
  height: number;
  /** Game animation → [file's animation, length in seconds, pictures, start time]. */
  anims: Record<string, [string, number, number, number?]>;
  colors?: Record<string, string>;
  opacity?: Record<string, number>;
  mask: string;
}

const ENEMIES: EnemyArt[] = [
  {
    type: 'kobold', model: 'Alien', height: 0.62, mask: 'Main',
    anims: { walk: ['Alien_Run', 0.88, 8], fight: ['Alien_Punch', 0.92, 6], death: ['Alien_Death', 2.29, 8] },
    colors: { Main: '#e6e6e6' },
  },
  {
    type: 'hexling', model: 'Alien_Helmet', height: 0.7, mask: 'Main',
    anims: { walk: ['Alien_Walk', 1.04, 8], fight: ['Alien_Punch', 0.92, 6], death: ['Alien_Death', 2.29, 8] },
    colors: { Main: '#e6e6e6', Glass: '#cfe8ff' },
    opacity: { Glass: 0.35 },
  },
  {
    type: 'brute', model: 'Robot', height: 0.95, mask: 'Main',
    anims: { walk: ['Robot_Walking', 0.96, 8], fight: ['Robot_Punch', 0.83, 6], death: ['Robot_Death', 0.96, 6] },
    colors: { Main: '#e6e6e6' },
  },
  {
    // No death in the file: the game lets the troll sink and fade.
    type: 'troll', model: 'Zombie', height: 1.4, mask: 'Texture',
    anims: { walk: ['ZombieWalk', 4.0, 12], fight: ['ZombieBite', 1.6, 8, 1.2] },
    colors: { Texture: '#e6e6e6' },
  },
];

const ENEMY_SHEETS = ENEMIES.flatMap((e) =>
  Object.entries(e.anims).map(([anim, [clip, length, n, start]]) => ({
    name: `${e.type}-${anim}`,
    model: `/art/monster-pack/${e.model}.fbx`,
    height: e.height,
    anim: clip,
    times: moments(length, n).map((t) => Math.round((t + (start ?? 0)) * 1000) / 1000),
    facing: 180,
    colors: e.colors,
    opacity: e.opacity,
    mask: e.mask,
  })),
);

/** How long each enemy animation lasts, for the game (seconds). */
export const ENEMY_ANIMS = Object.fromEntries(ENEMIES.map((e) => [e.type, Object.fromEntries(Object.entries(e.anims).map(([a, [, len]]) => [a, len]))]));

export const CHARACTERS = [...KNIGHTS, ...ENEMY_SHEETS];
