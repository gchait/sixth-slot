// One-on-one matchups using the main-series stat and damage formulas, with
// average IVs, no EVs, neutral natures and no random factor or critical hits.
// Moves count by their average damage per turn.
import type { GameData, Species, StatKey } from "./data.ts";

const IV = 15;

export function stat(species: Species, key: StatKey, level: number): number {
  const base = Math.floor(((2 * species.stats[key] + IV) * level) / 100);
  return key === "hp" ? base + level + 10 : base + 5;
}

/** Whether every ability the species can have is one of `abilities`. */
function always(species: Species, ...abilities: string[]): boolean {
  return (
    species.abilities.length > 0 &&
    species.abilities.every((a) => abilities.includes(a))
  );
}

/** Types that an ability makes its holder immune to. */
const immunities: Record<string, string> = {
  levitate: "ground",
  "flash-fire": "fire",
  "volt-absorb": "electric",
  "water-absorb": "water",
};

/**
 * How much of a move's damage the defender takes: the type chart, then the
 * abilities it is sure to have that block or soften the type. Wonder Guard is
 * left out: it turns on status, weather and other indirect damage, which
 * matchups do not model, so crediting it would overrate Shedinja.
 */
export function effectiveness(
  game: GameData,
  moveType: number,
  defender: Species,
): number {
  const typeName = game.types[moveType];
  for (const [ability, immuneTo] of Object.entries(immunities)) {
    if (typeName === immuneTo && always(defender, ability)) return 0;
  }
  const softened =
    (typeName === "fire" || typeName === "ice") &&
    always(defender, "thick-fat");
  return defender.types.reduce(
    (m, t) => m * game.typeChart[moveType][t],
    softened ? 0.5 : 1,
  );
}

/**
 * How the attacker's sure abilities change its damage: Huge Power and Pure
 * Power double Attack, and Truant acts every other turn.
 */
function offenseFactor(attacker: Species, physical: boolean): number {
  let factor = 1;
  if (physical && always(attacker, "huge-power", "pure-power")) factor *= 2;
  if (always(attacker, "truant")) factor *= 0.5;
  return factor;
}

/** Damage as a fraction of the defender's maximum HP. */
export function damageFraction(
  game: GameData,
  move: string,
  attacker: Species,
  attackerLevel: number,
  defender: Species,
  defenderLevel: number,
): number {
  const { type, power, physical, fixed, factor } = game.moves[move];
  const multiplier = effectiveness(game, type, defender);
  let damage: number;
  if (fixed !== undefined) {
    // Fixed damage only fails against an immune type.
    damage = multiplier === 0 ? 0 : fixed === "level" ? attackerLevel : fixed;
    damage *= offenseFactor(attacker, false);
  } else {
    const attack = stat(attacker, physical ? "atk" : "spa", attackerLevel);
    const defense = stat(defender, physical ? "def" : "spd", defenderLevel);
    const base =
      (((2 * attackerLevel) / 5 + 2) * power * attack) / defense / 50 + 2;
    const stab = attacker.types.includes(type) ? 1.5 : 1;
    damage = base * stab * multiplier * offenseFactor(attacker, physical);
  }
  return (damage * factor) / stat(defender, "hp", defenderLevel);
}

export function bestMove(
  game: GameData,
  moves: Iterable<string>,
  attacker: Species,
  attackerLevel: number,
  defender: Species,
  defenderLevel: number,
): { move: string | null; damage: number } {
  let best = { move: null as string | null, damage: 0 };
  for (const move of moves) {
    const damage = damageFraction(
      game,
      move,
      attacker,
      attackerLevel,
      defender,
      defenderLevel,
    );
    if (damage > best.damage) best = { move, damage };
  }
  return best;
}

/**
 * Moves a line knows at a battle: what it learned by `level` while being each
 * of `forms`, plus the HMs its current form can learn that are obtained by then.
 */
export function knownMoves(
  game: GameData,
  forms: string[],
  level: number,
  battle: number,
): Set<string> {
  const known = new Set<string>();
  for (const form of forms) {
    for (const [learnedAt, move] of game.species[form].learnset) {
      if (learnedAt <= level) known.add(move);
    }
  }
  for (const hm of game.species[forms[forms.length - 1]].hms) {
    if (game.hms[hm] <= battle) known.add(hm);
  }
  return known;
}

export const MATCHUP_LIMIT = 2;

export interface Matchup {
  /**
   * log2 of how many more hits the member survives than it needs, adjusted for
   * who moves first, clamped to ±MATCHUP_LIMIT. Positive means the member wins.
   */
  score: number;
  move: string | null;
  threat: string | null;
}

export function matchup(
  game: GameData,
  member: Species,
  memberMoves: Iterable<string>,
  memberLevel: number,
  opponent: Species,
  opponentMoves: string[],
  opponentLevel: number,
): Matchup {
  const dealt = bestMove(
    game,
    memberMoves,
    member,
    memberLevel,
    opponent,
    opponentLevel,
  );
  const taken = bestMove(
    game,
    opponentMoves,
    opponent,
    opponentLevel,
    member,
    memberLevel,
  );
  const memberSpeed = stat(member, "spe", memberLevel);
  const opponentSpeed = stat(opponent, "spe", opponentLevel);
  const tempo =
    memberSpeed > opponentSpeed ? 1.25 : memberSpeed < opponentSpeed ? 0.8 : 1;

  let score: number;
  if (dealt.damage === 0) score = -MATCHUP_LIMIT;
  else if (taken.damage === 0) score = MATCHUP_LIMIT;
  else score = Math.log2((dealt.damage * tempo) / taken.damage);
  return {
    score: Math.max(-MATCHUP_LIMIT, Math.min(MATCHUP_LIMIT, score)),
    move: dealt.move,
    threat: taken.move,
  };
}
