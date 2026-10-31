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
export const CHARACTERS = UNITS.flatMap((u) =>
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
