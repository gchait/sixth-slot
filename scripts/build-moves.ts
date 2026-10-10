// Types, the type chart and damaging moves as they were in the game's
// generation and version group, and which Pokémon learn which moves.
import type { FieldMove, Move } from "../engine/data.ts";
import {
  groupBy,
  indexBy,
  pastFor,
  type BuildContext,
} from "./build-context.ts";
import { identifierById } from "./pokeapi.ts";

type Row = Record<string, string>;

/**
 * How much of a move's damage counts toward a typical attack, by move effect:
 * moves that knock out the user or need a sleeping user or target count for
 * nothing, and moves that spend a turn charging, recharging or waiting count
 * for half.
 */
const drawbackByEffect: Record<string, number> = {
  "8": 0, // User faints
  "9": 0, // Dream Eater: target must be asleep
  "93": 0, // Snore: user must be asleep
  "102": 0, // False Swipe: cannot knock out
  "136": 0, // Hidden Power: type depends on IVs
  "159": 0, // Fake Out: first turn only
  "40": 0.5, // Charges first
  "76": 0.5,
  "146": 0.5,
  "152": 0.5,
  "81": 0.5, // Recharges after
  "149": 0.5, // Hits two turns later
  "171": 0.5, // Focus Punch: fails if hit first
};

/** Damage that ignores stats, by move effect: the user's level, or HP. */
const fixedDamageByEffect: Record<string, "level" | number> = {
  "88": "level", // Seismic Toss, Night Shade
  "42": 40, // Dragon Rage
  "131": 20, // Sonic Boom
};

/**
 * Triple Kick's effect: each of three strikes has one more share of the
 * move's power than the last, and needs every strike before it to hit.
 */
const RISING_STRIKES = "105";

/**
 * The average strikes of a move that hits `min` to `max` times. Moves that hit
 * 2 to 5 times average 3 strikes until generation V, and 3.1 from then on.
 */
function averageStrikes(min: number, max: number, generation: number) {
  if (min === max) return min;
  if (min === 2 && max === 5) return generation <= 4 ? 3 : 3.1;
  return undefined;
}

/** Until generation IV, a move's type decides whether it is physical. */
export function isPhysical(generation: number, type: Row, move: Row): boolean {
  return (generation <= 3 ? type : move).damage_class_id === "2";
}

export interface TypeTable {
  types: string[];
  /** Type rows in index order. */
  typeRows: Row[];
  /** Each type's index by its PokeAPI id. */
  typeIndex: Map<string, number>;
  typeChart: number[][];
}

/** Types and the type chart as they were in this generation. */
export function buildTypes({ t, generation }: BuildContext): TypeTable {
  const typeRows = t.types
    .filter(
      (row) =>
        Number(row.generation_id) <= generation && Number(row.id) < 10000,
    )
    .sort((a, b) => Number(a.id) - Number(b.id));
  const typeIndex = new Map(typeRows.map((row, i) => [row.id, i]));
  const types = typeRows.map((row) => row.identifier);
  const typeChart = types.map(() => types.map(() => 1));
  const setEfficacy = (row: Row) => {
    const a = typeIndex.get(row.damage_type_id);
    const d = typeIndex.get(row.target_type_id);
    if (a !== undefined && d !== undefined)
      typeChart[a][d] = Number(row.damage_factor) / 100;
  };
  t.type_efficacy.forEach(setEfficacy);
  const pastEfficacy = groupBy(
    t.type_efficacy_past.map((row) => ({
      ...row,
      pair: `${row.damage_type_id}:${row.target_type_id}`,
    })),
    "pair",
  );
  for (const rows of pastEfficacy.values())
    pastFor(rows, generation).forEach(setEfficacy);
  return { types, typeRows, typeIndex, typeChart };
}

export interface MoveCatalog {
  /** The damaging moves recorded so far, by identifier. */
  moves: Record<string, Move>;
  /** Records the move as it was in this game; undefined if it does no direct damage. */
  damagingMove: (moveId: string, context: string) => string | undefined;
  /** Damaging HMs by the stage they are obtained. */
  hms: Record<string, number>;
  fieldMoves: FieldMove[];
  /** This version group's level-up moves, by Pokémon. */
  learnsets: Map<string, Row[]>;
  /** Damaging HMs each Pokémon can learn. */
  hmUsers: Map<string, Row[]>;
  /** Field moves each Pokémon learns by machine. */
  fieldMachines: Map<string, Row[]>;
  /** Field moves each Pokémon learns by level. */
  fieldLevelUps: Map<string, Row[]>;
}

/**
 * Moves as they were in this version group. Each changelog row holds the
 * values a move had before the version group it names.
 */
export function buildMoves(
  context: BuildContext,
  { typeRows, typeIndex }: TypeTable,
): MoveCatalog {
  const {
    file,
    t,
    errors,
    generation,
    groupOrder,
    groupOrderById,
    versionGroup,
    moveRowsById,
    moveIdsByIdentifier,
    moveNames,
  } = context;
  const changelog = groupBy(t.move_changelog, "move_id");
  const metaByMove = indexBy(t.move_meta, "move_id");
  const moves: Record<string, Move> = {};
  function damagingMove(moveId: string, where: string): string | undefined {
    const row = moveRowsById.get(moveId)!;
    const later = (changelog.get(moveId) ?? [])
      .filter(
        (c) =>
          (groupOrderById.get(c.changed_in_version_group_id) ?? 0) > groupOrder,
      )
      .sort(
        (a, b) =>
          groupOrderById.get(a.changed_in_version_group_id)! -
          groupOrderById.get(b.changed_in_version_group_id)!,
      );
    const typeId = later.find((c) => c.type_id)?.type_id ?? row.type_id;
    const effectId = later.find((c) => c.effect_id)?.effect_id ?? row.effect_id;
    const power = Number(later.find((c) => c.power)?.power ?? row.power);
    const fixed = fixedDamageByEffect[effectId];
    const drawback = drawbackByEffect[effectId] ?? 1;
    if ((!power && fixed === undefined) || drawback === 0) return undefined;
    // An empty accuracy means the move never misses.
    const accuracy =
      Number(later.find((c) => c.accuracy)?.accuracy ?? row.accuracy) / 100 ||
      1;
    const meta = metaByMove.get(moveId);
    const strikes = meta?.min_hits
      ? averageStrikes(Number(meta.min_hits), Number(meta.max_hits), generation)
      : 1;
    if (strikes === undefined) {
      errors.push(`${where}: ${row.identifier} has an unknown hit count`);
      return undefined;
    }
    const type = typeIndex.get(typeId);
    if (type === undefined) {
      errors.push(
        `${where}: ${row.identifier} has a type generation ${generation} lacks`,
      );
      return undefined;
    }
    const physical = isPhysical(generation, typeRows[type], row);
    moves[row.identifier] ??= {
      name: moveNames.get(moveId) ?? row.identifier,
      type,
      power: fixed === undefined ? power : 0,
      physical,
      ...(fixed !== undefined && { fixed }),
      factor:
        drawback *
        (effectId === RISING_STRIKES
          ? accuracy + 2 * accuracy ** 2 + 3 * accuracy ** 3
          : strikes * accuracy),
    };
    return row.identifier;
  }

  const methodIds = identifierById(t.pokemon_move_methods);
  /** This version group's learnable moves by `method`, by Pokémon. */
  const movesBy = (method: string, keep: (row: Row) => boolean = () => true) =>
    groupBy(
      t.pokemon_moves.filter(
        (row) =>
          row.version_group_id === versionGroup.id &&
          methodIds.get(row.pokemon_move_method_id) === method &&
          keep(row),
      ),
      "pokemon_id",
    );
  const hms: Record<string, number> = {};
  for (const [move, stage] of Object.entries(file.hms)) {
    const moveId = moveIdsByIdentifier.get(move);
    if (!moveId) errors.push(`hms: unknown move ${move}`);
    else if (damagingMove(moveId, "hms") && typeof stage === "number")
      hms[move] = stage;
  }
  const hmUsers = movesBy(
    "machine",
    (row) => moveRowsById.get(row.move_id)!.identifier in hms,
  );
  const learnsets = movesBy("level-up");
  const fieldMoves: FieldMove[] = [];
  for (const [move, stage] of Object.entries(file.fieldMoves)) {
    const moveId = moveIdsByIdentifier.get(move);
    if (!moveId) errors.push(`fieldMoves: unknown move ${move}`);
    else
      fieldMoves.push({ id: move, name: moveNames.get(moveId) ?? move, stage });
    const obtained = file.hms[move];
    if (
      obtained !== undefined &&
      !(typeof obtained === "number" && obtained <= stage)
    )
      errors.push(`fieldMoves.${move}: works before hms.${move} is obtained`);
  }
  const isFieldMove = (row: Row) =>
    moveRowsById.get(row.move_id)!.identifier in file.fieldMoves;

  return {
    moves,
    damagingMove,
    hms,
    fieldMoves,
    learnsets,
    hmUsers,
    fieldMachines: movesBy("machine", isFieldMove),
    fieldLevelUps: movesBy("level-up", isFieldMove),
  };
}
