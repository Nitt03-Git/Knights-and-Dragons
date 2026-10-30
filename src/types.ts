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
  range: number;
  cooldown: number;
  damage: [number, number];
  damageType: DamageType;
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
  paths: { points: Point[] }[];
  pads: Point[];
  waves: { groups: WaveGroup[] }[];
}
