// One-on-one matchups using the Generation III stat and damage formulas, with
// average IVs, no EVs, neutral natures and no random factor or critical hits.
import type { GameData, Species, StatKey } from "./data.ts";

const IV = 15;

export function stat(species: Species, key: StatKey, level: number): number {
  const base = Math.floor(((2 * species.stats[key] + IV) * level) / 100);
  return key === "hp" ? base + level + 10 : base + 5;
}

export function effectiveness(
  game: GameData,
  moveType: number,
  defender: Species,
): number {
  return defender.types.reduce((m, t) => m * game.typeChart[moveType][t], 1);
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
  const { type, power } = game.moves[move];
  const physical = game.physicalTypes[type];
  const attack = stat(attacker, physical ? "atk" : "spa", attackerLevel);
  const defense = stat(defender, physical ? "def" : "spd", defenderLevel);
  const base =
    (((2 * attackerLevel) / 5 + 2) * power * attack) / defense / 50 + 2;
  const stab = attacker.types.includes(type) ? 1.5 : 1;
  return (
    (base * stab * effectiveness(game, type, defender)) /
    stat(defender, "hp", defenderLevel)
  );
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
