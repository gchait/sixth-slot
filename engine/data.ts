// The per-game data file the build writes to public/data/<game>.json.
// Stage n means "after beating the first n battles"; stage 0 is the start.

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type Stats = Record<StatKey, number>;

export interface Species {
  id: string;
  name: string;
  /** Number in the game's regional Pokédex. */
  dex: number;
  /** Number in the National Pokédex. */
  national: number;
  /** Indices into GameData.types. */
  types: number[];
  stats: Stats;
  legendary: boolean;
  /** Damaging moves learned by leveling up, as [level, move id], by level. */
  learnset: [number, string][];
  /** Damaging HMs the species can learn, as keys of GameData.hms. */
  hms: string[];
}

export interface Move {
  name: string;
  /** Index into GameData.types. */
  type: number;
  /** Base power, reduced for moves with a drawback that limits their use. */
  power: number;
}

export type EvolutionMethod =
  | { kind: "level"; level: number }
  | { kind: "item"; item: string; stage: number }
  | { kind: "trade" };

export interface Evolution {
  from: string;
  to: string;
  method: EvolutionMethod;
}

export interface Source {
  stage: number;
  location: string;
  method: string;
  minLevel: number;
  maxLevel: number;
  /** For an in-game trade, the species the player must give. */
  gives?: string;
}

export interface Opponent {
  species: string;
  level: number;
  /** The opponent's damaging moves, as keys of GameData.moves. */
  moves: string[];
}

export interface Battle {
  id: string;
  name: string;
  title: string;
  /** The highest level in any of the battle's parties. */
  aceLevel: number;
  /** Keyed by the player's starter, or "*" when the party never changes. */
  parties: Record<string, Opponent[]>;
}

export interface GameData {
  id: string;
  name: string;
  generation: number;
  /** Sprite URL with {national} standing for the National Pokédex number. */
  sprite: string;
  versions: { id: string; name: string }[];
  types: string[];
  /** typeChart[attacking][defending] damage multiplier. */
  typeChart: number[][];
  /** Whether attacks of each type use Attack (true) or Special Attack. */
  physicalTypes: boolean[];
  species: Record<string, Species>;
  /** Damaging moves that some learnset or opponent uses. */
  moves: Record<string, Move>;
  evolutions: Evolution[];
  /** Where each species can be obtained during the main story, per version. */
  sources: Record<string, Record<string, Source[]>>;
  items: Record<string, string>;
  /** The stage at which each damaging HM is obtained. */
  hms: Record<string, number>;
  starters: string[];
  exclusiveGroups: string[][];
  battles: Battle[];
}
