// Shapes of the data files in /data. The game reads everything it can tune from there.

export type Point = [number, number];
export type DamageType = 'physical' | 'magic';

export interface Rules {
  startGold: number;
  lives: number;
  /** Share of everything spent on a tower that selling gives back. */
  sellRefund: number;
  /** Seconds between the last spawn of a wave and the next wave starting by itself. */
  waveGap: number;
  /** Gold per second left on the clock when a wave is called early. */
  earlyBonusPerSecond: number;
  /** Lives needed for 3 and 2 stars; any win is at least 1 star. */
  starLives: [number, number];
  /** Sideways offsets (world units) of the walking lanes on a road. */
  laneOffsets: number[];
  laneJitter: number;
}

export interface TowerLevel {
  cost: number;
  /** Shooting range, or for a hall: how far from the hall its flag may stand. */
  range: number;
  /** Seconds between shots (or a unit's sword blows). */
  cooldown: number;
  damage: [number, number];
  damageType: DamageType;
  /** Catapults: shots land on the ground and hurt everything within this radius (never flyers). */
  splash?: number;
  /** 0..1, share of the target's armor that this damage ignores. */
  armorPierce?: number;
  /** Present on halls: the units they send to the road. */
  unit?: UnitStats;
}

export interface UnitStats {
  count: number;
  hp: number;
  /** 0..1, share of physical damage blocked. */
  armor: number;
  /** Seconds before a fallen unit returns. */
  respawn: number;
  /** Health per second regained while not fighting. */
  regen: number;
  speed: number;
  /** How many enemies one unit can hold in place at the same time. */
  holds: number;
}

export interface TowerSpec {
  name: string;
  levels: TowerLevel[];
}

export interface EnemySpec {
  name: string;
  hp: number;
  speed: number;
  /** 0..1, share of physical damage blocked. */
  armor: number;
  /** 0..1, share of magic damage blocked. */
  magicResist: number;
  bounty: number;
  lifeCost: number;
  size: number;
  /** Melee blows against a knight holding it. */
  attack: [number, number];
  attackCooldown: number;
  /** Flying enemies can't be held by knights. */
  flying?: boolean;
}

export interface Balance {
  rules: Rules;
  towers: Record<string, TowerSpec>;
  enemies: Record<string, EnemySpec>;
}

export interface WaveGroup {
  enemy: string;
  count: number;
  interval: number;
  /** Seconds after the wave starts before this group begins. */
  delay?: number;
  /** Which road (index into paths); 0 when left out. */
  path?: number;
}

export interface Level {
  id: string;
  name: string;
  /** Overrides the rules' starting gold for this level. */
  startGold?: number;
  paths: { points: Point[] }[];
  pads: Point[];
  waves: { groups: WaveGroup[] }[];
}
