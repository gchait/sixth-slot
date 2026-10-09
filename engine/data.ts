// The per-game data file the build writes to generated/<game>.json. Stages
// are those of the game files, described in data/schema.ts.

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type Stats = Record<StatKey, number>;

export interface Species {
  id: string;
  name: string;
  /** Number in the National Pokédex. */
  national: number;
  /** Indices into GameData.types. */
  types: number[];
  stats: Stats;
  legendary: boolean;
  /** Abilities a wild or gifted one can have; one of them, chosen at random. */
  abilities: string[];
  /** Damaging moves learned by leveling up, as [level, move id], by level. */
  learnset: [number, string][];
  /** Damaging HMs the species can learn, as keys of GameData.hms. */
  hms: string[];
  /**
   * The game's field moves the species can learn, by the lowest level it can
   * know each at: 1 when a machine teaches it.
   */
  fieldMoves: Record<string, number>;
}

export interface Move {
  name: string;
  /** Index into GameData.types. */
  type: number;
  /** Base power of one strike; 0 for a move with fixed damage. */
  power: number;
  /** Whether the move uses Attack and Defense rather than their special counterparts. */
  physical: boolean;
  /** Damage that ignores stats: the user's level, or a number of HP. */
  fixed?: "level" | number;
  /**
   * The share of one strike's damage the move deals per turn on average: its
   * chance to hit, times its strikes, times the share of turns it can attack.
   */
  factor: number;
}

/** What an evolution needs; all of it must hold. */
export interface EvolutionRequirements {
  /** The level to reach, compared with the player's level at each battle. */
  level?: number;
  /** The stage by which an item, place or other means is available. */
  stage?: number;
  /** A trade with another player. */
  trade?: boolean;
  /** Friendship or affection, built up over at least one battle. */
  friendship?: boolean;
  /** Another species the player must hold, as a party member or trade partner. */
  species?: string;
  /** A type some party member must have, as an index into GameData.types. */
  partyType?: number;
  /** The Pokémon becomes one of several evolutions, which it cannot choose. */
  random?: boolean;
}

export interface Evolution {
  from: string;
  to: string;
  /** How the evolution reads to a player, such as "Lv 16" or "Thunder Stone". */
  label: string;
  requires: EvolutionRequirements;
}

/** Where and when a species can be obtained: a trade, or an encounter at some levels. */
export type Source = {
  stage: number;
  location: string;
  method: string;
} & (
  | {
      /** The species an in-game trade asks for. */
      gives: string;
    }
  | {
      /** The lowest and highest level it is found at. */
      levels: [number, number];
    }
);

/** A move the team itself keeps for use outside battle, from `stage` on. */
export interface FieldMove {
  id: string;
  name: string;
  stage: number;
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
  /** A battle after the Champion, such as a rematch, listed after every story battle. */
  postgame: boolean;
  /**
   * The player's level by this battle, taken to be the highest opponent level
   * in it or any battle before, since a team does not lose levels.
   */
  level: number;
  /** Keyed by the player's starter. */
  parties: Record<string, Opponent[]>;
}

export interface GameData {
  id: string;
  name: string;
  /** Sprite URL with {national} standing for the National Pokédex number. */
  sprite: string;
  versions: { id: string; name: string }[];
  types: string[];
  /** typeChart[attacking][defending] damage multiplier. */
  typeChart: number[][];
  species: Record<string, Species>;
  /** Damaging moves that some learnset or opponent uses. */
  moves: Record<string, Move>;
  evolutions: Evolution[];
  /** Where each species can be obtained outside the post-game story, per version. */
  sources: Record<string, Record<string, Source[]>>;
  /** The stage at which each damaging HM is obtained. */
  hms: Record<string, number>;
  fieldMoves: FieldMove[];
  starters: string[];
  exclusiveGroups: string[][];
  battles: Battle[];
}

/** The game's field moves by name, such as "Fly and Surf". */
export function fieldMoveNames(game: GameData): string {
  const names = game.fieldMoves.map((m) => m.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}

/** The sprite URL of one species. */
export function spriteOf(game: GameData, species: string): string {
  return game.sprite.replace(
    "{national}",
    String(game.species[species].national),
  );
}
