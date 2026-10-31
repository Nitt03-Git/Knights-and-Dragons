// How every unit and tower looks: size, how it moves and its colours. The published looks are in
// data/looks.json; the Look Lab lets the owner change them on the phone (kept there, and used by
// the game on that phone) and copy them to paste in the chat. No DOM here except storage.
import looksJson from '../data/looks.json';

export interface Look {
  /** Drawn size, 1 = normal. */
  size: number;
  /** How high it bobs while walking or flying, 1 = normal. */
  bounce?: number;
  /** How fast its legs, wings and sword move, 1 = normal. */
  speed?: number;
  /** How far the sword swings (wings flap, for flyers), 1 = normal. */
  swing?: number;
  /** Units: named colours. */
  colors?: Record<string, string>;
  /** Towers (Kenney pictures): roof colour and kind of stone. */
  roof?: string;
  stone?: string;
}

export type Looks = Record<string, Look>;

const KEY = 'knights-and-dragons.looks.v1';

export const DEFAULT_LOOKS: Looks = looksJson as unknown as Looks;

/** The slider settings, with their ranges. */
export const LOOK_SLIDERS = {
  size: { label: 'Size', min: 0.6, max: 1.6, step: 0.05 },
  bounce: { label: 'Bounce', min: 0, max: 3, step: 0.1 },
  speed: { label: 'Speed', min: 0.3, max: 3, step: 0.1 },
  swing: { label: 'Sword swing', min: 0, max: 2.5, step: 0.1 },
} as const;
export type SliderKey = keyof typeof LOOK_SLIDERS;

/** Choices instead of free colours, for towers: the colour sets the pictures were made in. */
export const LOOK_CHOICES = {
  roof: { label: 'Roof', options: ['blue', 'red', 'green', 'yellow', 'purple'] },
  stone: { label: 'Stone', options: ['sand', 'grey'] },
} as const;
export type ChoiceKey = keyof typeof LOOK_CHOICES;
export const CHOICE_KEYS = Object.keys(LOOK_CHOICES) as ChoiceKey[];

/** Names shown in the Look Lab. */
export const LOOK_NAMES: Record<string, string> = {
  knight: 'Knight',
  soldier: 'Reinforcement',
  hero: 'Roch',
  kobold: 'Kobold Runner',
  brute: 'Scaled Brute',
  troll: 'Bridge Troll',
  hexling: 'Hexling',
  wyrmling: 'Wyrmling',
  archer: 'Bowmen tower',
  knights: "Knights' Hall",
  wizard: 'Wizard tower',
  catapult: 'Catapult',
};

export const COLOR_NAMES: Record<string, string> = {
  armor: 'Armor',
  tabard: 'Tabard',
  trim: 'Gold trim',
  horse: 'Horse',
  mane: 'Mane and tail',
  cloth: 'Blanket and shield',
  plume: 'Plume',
  body: 'Body',
  belly: 'Belly',
  stone: 'Stone',
  roof: 'Roof',
  banner: 'Banner',
  orb: 'Orb and bolts',
  wood: 'Wood',
};

/** The label of a slider for one unit: flyers flap wings instead of swinging a sword. */
export function sliderLabel(id: string, key: SliderKey): string {
  if (key === 'swing' && id === 'wyrmling') return 'Wing flap';
  if (key === 'speed' && id === 'wyrmling') return 'Flap speed';
  return LOOK_SLIDERS[key].label;
}

const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/**
 * The defaults with the phone's changes on top. Only settings the defaults have are taken,
 * numbers are kept within the slider ranges and colours must be #rrggbb.
 */
export function mergeLooks(defaults: Looks, changes: unknown): Looks {
  const out: Looks = structuredClone(defaults);
  if (!changes || typeof changes !== 'object') return out;
  for (const [id, look] of Object.entries(out)) {
    const c = (changes as Record<string, Partial<Look> | undefined>)[id];
    if (!c || typeof c !== 'object') continue;
    for (const key of Object.keys(LOOK_SLIDERS) as SliderKey[]) {
      const v = c[key];
      const r = LOOK_SLIDERS[key];
      if (look[key] !== undefined && typeof v === 'number' && Number.isFinite(v)) look[key] = Math.min(r.max, Math.max(r.min, v));
    }
    for (const name of Object.keys(look.colors ?? {})) {
      const v = c.colors?.[name];
      if (isColor(v)) look.colors![name] = v.toLowerCase();
    }
    for (const key of CHOICE_KEYS) {
      const v = c[key];
      if (look[key] !== undefined && (LOOK_CHOICES[key].options as readonly string[]).includes(v as string)) look[key] = v;
    }
  }
  return out;
}

/** Only what differs from the defaults: what the phone keeps. */
export function lookChanges(looks: Looks, defaults: Looks = DEFAULT_LOOKS): Record<string, Partial<Look>> {
  const out: Record<string, Partial<Look>> = {};
  for (const [id, look] of Object.entries(looks)) {
    const d = defaults[id];
    if (!d) continue;
    const c: Partial<Look> = {};
    for (const key of Object.keys(LOOK_SLIDERS) as SliderKey[]) if (look[key] !== d[key]) c[key] = look[key];
    for (const key of CHOICE_KEYS) if (look[key] !== d[key]) c[key] = look[key];
    const colors: Record<string, string> = {};
    for (const [name, v] of Object.entries(look.colors ?? {})) if (v.toLowerCase() !== d.colors?.[name]?.toLowerCase()) colors[name] = v;
    if (Object.keys(colors).length) c.colors = colors;
    if (Object.keys(c).length) out[id] = c;
  }
  return out;
}

function loadChanges(): unknown {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** The looks the game draws with right now. */
export const LOOKS: Looks = mergeLooks(DEFAULT_LOOKS, loadChanges());

function save(): void {
  try {
    const changes = lookChanges(LOOKS);
    if (Object.keys(changes).length) localStorage.setItem(KEY, JSON.stringify(changes));
    else localStorage.removeItem(KEY);
  } catch {
    // Not saved; the changes last until the page closes.
  }
}

export function setLookNumber(id: string, key: SliderKey, value: number): void {
  const look = LOOKS[id];
  if (!look || look[key] === undefined) return;
  const r = LOOK_SLIDERS[key];
  look[key] = Math.round(Math.min(r.max, Math.max(r.min, value)) * 100) / 100;
  save();
}

export function setLookColor(id: string, name: string, value: string): void {
  const look = LOOKS[id];
  if (!look?.colors || !(name in look.colors) || !isColor(value)) return;
  look.colors[name] = value.toLowerCase();
  save();
}

export function setLookChoice(id: string, key: ChoiceKey, value: string): void {
  const look = LOOKS[id];
  if (!look || look[key] === undefined || !(LOOK_CHOICES[key].options as readonly string[]).includes(value)) return;
  look[key] = value;
  save();
}

/** Back to the published look: one unit, or all of them. */
export function resetLooks(id?: string): void {
  for (const key of id ? [id] : Object.keys(LOOKS)) LOOKS[key] = structuredClone(DEFAULT_LOOKS[key]);
  save();
}

/** The looks as they would sit in data/looks.json: one line per unit. */
export function looksToJson(looks: Looks = LOOKS): string {
  const lines = Object.entries(looks).map(([id, look]) => {
    const parts = (Object.keys(LOOK_SLIDERS) as SliderKey[]).filter((k) => look[k] !== undefined).map((k) => `"${k}": ${look[k]}`);
    for (const k of CHOICE_KEYS) if (look[k] !== undefined) parts.push(`"${k}": "${look[k]}"`);
    if (look.colors) parts.push(`"colors": { ${Object.entries(look.colors).map(([n, c]) => `"${n}": "${c}"`).join(', ')} }`);
    return `  "${id}": { ${parts.join(', ')} }`;
  });
  return `{\n${lines.join(',\n')}\n}`;
}

/** Only the changes, one line per unit: what the Look Lab copies to paste in the chat. */
export function changesToJson(looks: Looks = LOOKS): string {
  const lines = Object.entries(lookChanges(looks)).map(([id, c]) => {
    const parts = (Object.keys(LOOK_SLIDERS) as SliderKey[]).filter((k) => c[k] !== undefined).map((k) => `"${k}": ${c[k]}`);
    for (const k of CHOICE_KEYS) if (c[k] !== undefined) parts.push(`"${k}": "${c[k]}"`);
    if (c.colors) parts.push(`"colors": { ${Object.entries(c.colors).map(([n, v]) => `"${n}": "${v}"`).join(', ')} }`);
    return `  "${id}": { ${parts.join(', ')} }`;
  });
  return `{\n${lines.join(',\n')}\n}`;
}

/** A colour made darker (amount < 0) or lighter (amount > 0), for shading. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** A colour as "r, g, b", for rgba() with a see-through amount. */
export function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const PLAIN: Look = { size: 1, bounce: 1, speed: 1, swing: 1, colors: { body: '#999999', belly: '#cccccc' } };

/** A unit's look, or a plain grey one for something without a look yet. */
export function lookOf(id: string): Look {
  return LOOKS[id] ?? PLAIN;
}

/** A unit's colours (a tower has none: it uses a roof and stone instead). */
export function colorsOf(id: string): Record<string, string> {
  return lookOf(id).colors ?? PLAIN.colors!;
}
