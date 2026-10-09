// Finds the best teams. A team's score is, averaged over every battle, the mean
// over that battle's opponents of the team's best one-on-one matchup against it,
// minus a penalty for weaknesses many members share. Only members obtainable by
// a battle count for it, in the form they would have by then.
import {
  effectiveness,
  knownMoves,
  matchup,
  MATCHUP_LIMIT,
  type Matchup,
} from "./battle.ts";
import { buildCandidates, type Candidate, type Options } from "./candidates.ts";
import type { GameData, Opponent } from "./data.ts";

export const TEAM_SIZE = 6;
/** Penalty per member beyond two that is weak to the same attacking type. */
export const SHARED_WEAKNESS_PENALTY = 0.05;

export interface Team {
  members: string[];
  score: number;
}

export interface SearchResult {
  candidates: Candidate[];
  teams: Team[];
  /** Complete teams scored; the rest were ruled out before being completed. */
  evaluated: number;
}

interface Slot {
  battle: number;
  opponent: Opponent;
  weight: number;
}

/** The battles a team is scored on, by index into GameData.battles. */
export function scoredBattles(game: GameData, options: Options): number[] {
  return game.battles.flatMap((battle, b) =>
    !battle.rematch || options.includeRematches ? [b] : [],
  );
}

/** Every opponent the team faces, weighted so each battle counts equally. */
export function opponentsFor(game: GameData, options: Options): Slot[] {
  const battles = scoredBattles(game, options);
  return battles.flatMap((b) => {
    const { parties } = game.battles[b];
    const party = parties[options.starter] ?? parties["*"];
    return party.map((opponent) => ({
      battle: b,
      opponent,
      weight: 1 / (battles.length * party.length),
    }));
  });
}

/** The member's matchup against the opponent, or null if it has not joined yet. */
export function candidateMatchup(
  game: GameData,
  candidate: Candidate,
  slot: Slot,
): Matchup | null {
  const form = candidate.forms[slot.battle];
  if (form < 0) return null;
  const level = game.battles[slot.battle].aceLevel;
  const forms = candidate.line.slice(0, form + 1);
  const opponent = game.species[slot.opponent.species];
  return matchup(
    game,
    game.species[forms[form]],
    knownMoves(game, forms, level, slot.battle),
    level,
    opponent,
    slot.opponent.moves,
    slot.opponent.level,
  );
}

function weaknesses(game: GameData, candidate: Candidate): number[] {
  const species = game.species[candidate.id];
  return game.types.flatMap((_, attacking) =>
    effectiveness(game, attacking, species) > 1 ? [attacking] : [],
  );
}

export function sharedWeaknessPenalty(
  game: GameData,
  team: Candidate[],
): number {
  const counts = new Array<number>(game.types.length).fill(0);
  for (const member of team)
    for (const t of weaknesses(game, member)) counts[t]++;
  return (
    counts.reduce((sum, n) => sum + Math.max(0, n - 2), 0) *
    SHARED_WEAKNESS_PENALTY
  );
}

export function search(
  game: GameData,
  options: Options,
  limit = 10,
): SearchResult {
  const all = buildCandidates(game, options);
  const banned = new Set(options.banned);
  const candidates = all.filter(
    (c) => !banned.has(c.id) || options.pinned.includes(c.id),
  );

  const starters = candidates.filter((c) => c.family === options.starter);
  if (starters.length !== 1) {
    throw new Error(
      `expected one line for starter ${options.starter}, found ${starters.length}`,
    );
  }
  const pinned = options.pinned.map((id) => {
    const c = candidates.find((candidate) => candidate.id === id);
    if (!c) {
      throw new Error(
        `${game.species[id]?.name ?? id} cannot join a team with these settings`,
      );
    }
    return c;
  });
  const required = [starters[0], ...pinned].filter(
    (c, i, list) => list.indexOf(c) === i,
  );

  const slots = opponentsFor(game, options);
  const width = slots.length;
  const weights = Float64Array.from(slots, (s) => s.weight);
  const values = new Map(
    candidates.map((c) => [
      c,
      Float64Array.from(
        slots,
        (slot) => candidateMatchup(game, c, slot)?.score ?? -MATCHUP_LIMIT,
      ),
    ]),
  );
  const groupOf = new Map<string, number>();
  game.exclusiveGroups.forEach((group, i) =>
    group.forEach((s) => groupOf.set(s, i)),
  );

  // Optional members, strongest alone first, so good teams are found early.
  const individual = (c: Candidate) =>
    values.get(c)!.reduce((sum, v, i) => sum + v * weights[i], 0);
  const optional = candidates
    .filter((c) => !required.includes(c))
    .sort((a, b) => individual(b) - individual(a));
  const n = optional.length;
  const value = optional.map((c) => values.get(c)!);
  const typeMask = (c: Candidate) =>
    game.species[c.id].types.reduce((mask, t) => mask | (1 << t), 0);
  const types = optional.map(typeMask);
  const groupMask = (c: Candidate) =>
    groupOf.has(c.family) ? 1 << groupOf.get(c.family)! : 0;
  const groups = optional.map(groupMask);
  const families = optional.map((c) => c.family);

  const teams: Team[] = [];
  let evaluated = 0;
  const threshold = () =>
    teams.length < limit ? -Infinity : teams[teams.length - 1].score;

  const members: Candidate[] = [];
  const familiesTaken: string[] = [];
  let typesTaken = 0;
  let groupsTaken = 0;
  const join = (
    c: Candidate,
    family: string,
    typeBits: number,
    groupBits: number,
  ) => {
    const clash =
      familiesTaken.includes(family) ||
      (groupsTaken & groupBits) !== 0 ||
      (options.uniqueTypes && (typesTaken & typeBits) !== 0);
    if (clash) return false;
    members.push(c);
    familiesTaken.push(family);
    typesTaken |= typeBits;
    groupsTaken |= groupBits;
    return true;
  };
  const leave = (typeBits: number, groupBits: number) => {
    members.pop();
    familiesTaken.pop();
    typesTaken &= ~typeBits;
    groupsTaken &= ~groupBits;
  };

  // best[d] is, per opponent, the team's best value after d members.
  const best = Array.from(
    { length: TEAM_SIZE + 1 },
    () => new Float64Array(width),
  );
  best[0].fill(-MATCHUP_LIMIT);
  const extend = (depth: number, v: Float64Array) => {
    let score = 0;
    for (let o = 0; o < width; o++) {
      const b = Math.max(best[depth][o], v[o]);
      best[depth + 1][o] = b;
      score += b * weights[o];
    }
    return score;
  };

  for (const c of required) {
    if (!join(c, c.family, typeMask(c), groupMask(c))) {
      const others = members.map((m) => game.species[m.id].name).join(", ");
      throw new Error(
        `${game.species[c.id].name} cannot join ${others}: same family, an either-or gift, or a shared type`,
      );
    }
    extend(members.length - 1, values.get(c)!);
  }

  // Adding members raises the score by at most the sum of what each would add
  // alone, so a partial team cannot beat its score plus its best remaining gains.
  const gains = new Float64Array(n);
  const explore = (score: number, start: number) => {
    const depth = members.length;
    const left = TEAM_SIZE - depth;
    if (left === 0) {
      evaluated++;
      const total = score - sharedWeaknessPenalty(game, members);
      if (total > threshold()) {
        teams.push({ members: members.map((c) => c.id), score: total });
        teams.sort((a, b) => b.score - a.score);
        if (teams.length > limit) teams.pop();
      }
      return;
    }
    if (n - start < left) return;

    const current = best[depth];
    const top: number[] = [];
    for (let i = start; i < n; i++) {
      let gain = 0;
      const v = value[i];
      for (let o = 0; o < width; o++)
        if (v[o] > current[o]) gain += (v[o] - current[o]) * weights[o];
      gains[i] = gain;
      top.push(gain);
    }
    top.sort((a, b) => b - a);
    let rest = 0;
    for (let k = 0; k < left - 1; k++) rest += top[k];
    if (score + top[0] + rest <= threshold()) return;

    for (let i = start; i <= n - left; i++) {
      if (score + gains[i] + rest <= threshold()) continue;
      const c = optional[i];
      if (!join(c, families[i], types[i], groups[i])) continue;
      explore(extend(depth, value[i]), i + 1);
      leave(types[i], groups[i]);
    }
  };
  let base = 0;
  for (let o = 0; o < width; o++) base += best[members.length][o] * weights[o];
  explore(base, 0);

  return { candidates: all, teams, evaluated };
}

export interface Answer {
  opponent: Opponent;
  /** The member with the best matchup and the form it has by then, if any member has joined. */
  member: string | null;
  form: string | null;
  matchup: Matchup | null;
}

export interface BattleReport {
  battle: number;
  /** Mean of the answers' matchup scores. */
  score: number;
  answers: Answer[];
}

/** How a team handles each battle: its best answer to every opponent. */
export function explain(
  game: GameData,
  options: Options,
  team: Candidate[],
): BattleReport[] {
  const slots = opponentsFor(game, options);
  return scoredBattles(game, options).map((b) => {
    const answers = slots
      .filter((slot) => slot.battle === b)
      .map((slot): Answer => {
        let answer: Answer = {
          opponent: slot.opponent,
          member: null,
          form: null,
          matchup: null,
        };
        for (const c of team) {
          const m = candidateMatchup(game, c, slot);
          if (m && (!answer.matchup || m.score > answer.matchup.score)) {
            answer = {
              opponent: slot.opponent,
              member: c.id,
              form: c.line[c.forms[b]],
              matchup: m,
            };
          }
        }
        return answer;
      });
    const score =
      answers.reduce(
        (sum, a) => sum + (a.matchup?.score ?? -MATCHUP_LIMIT),
        0,
      ) / answers.length;
    return { battle: b, score, answers };
  });
}

/** A team's score, computed directly rather than through the search. */
export function scoreTeam(
  game: GameData,
  options: Options,
  team: Candidate[],
): number {
  const reports = explain(game, options, team);
  const total = reports.reduce((sum, r) => sum + r.score, 0) / reports.length;
  return total - sharedWeaknessPenalty(game, team);
}
