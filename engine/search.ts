// Finds the best teams. A team's score is, averaged over every battle, the mean
// over that battle's opponents of the team's best one-on-one matchup against it,
// minus a penalty for weaknesses many members share. Only members obtainable by
// a battle count for it, in the form they would have by then. Teams can be
// required to keep a member for each of the game's field moves.
import {
  effectiveness,
  knownMoves,
  matchup,
  MATCHUP_LIMIT,
  type Matchup,
} from "./battle.ts";
import { buildCandidates, type Candidate, type Options } from "./candidates.ts";
import { fieldMoveNames, met, type GameData, type Opponent } from "./data.ts";

export const TEAM_SIZE = 6;
/** Penalty per member beyond two that is weak to the same attacking type. */
const SHARED_WEAKNESS_PENALTY = 0.05;

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
function scoredBattles(game: GameData, options: Options): number[] {
  return game.battles.flatMap((battle, b) =>
    !battle.postgame || options.includePostgame ? [b] : [],
  );
}

/** Every opponent the team faces, weighted so each battle counts equally. */
function opponentsFor(game: GameData, options: Options): Slot[] {
  const battles = scoredBattles(game, options);
  return battles.flatMap((b) => {
    const { party } = met(game.battles[b], options);
    return party.map((opponent) => ({
      battle: b,
      opponent,
      weight: 1 / (battles.length * party.length),
    }));
  });
}

/** The member's matchup against the opponent, or null if it has not joined yet. */
function candidateMatchup(
  game: GameData,
  candidate: Candidate,
  slot: Slot,
): Matchup | null {
  const form = candidate.forms[slot.battle];
  if (form < 0) return null;
  const level = game.battles[slot.battle].level;
  const opponent = game.species[slot.opponent.species];
  return matchup(
    game,
    game.species[candidate.line[form]],
    knownMoves(game, candidate, slot.battle),
    level,
    opponent,
    slot.opponent.moves,
    slot.opponent.level,
  );
}

/** The attacking types the candidate is weak to, one bit per type. */
function weaknessMask(game: GameData, candidate: Candidate): number {
  const species = game.species[candidate.id];
  return game.types.reduce(
    (mask, _, attacking) =>
      effectiveness(game, attacking, species) > 1
        ? mask | (1 << attacking)
        : mask,
    0,
  );
}

/** The penalty for the members' weakness masks. */
function sharedWeaknessPenalty(game: GameData, masks: number[]): number {
  let excess = 0;
  for (let t = 0; t < game.types.length; t++) {
    let count = 0;
    for (const mask of masks) if (mask & (1 << t)) count++;
    excess += Math.max(0, count - 2);
  }
  return excess * SHARED_WEAKNESS_PENALTY;
}

export function search(
  game: GameData,
  options: Options,
  limit = 10,
): SearchResult {
  const all = buildCandidates(game, options);
  const banned = new Set(options.banned);
  // The starter is always on the team, so excluding it has no effect.
  const candidates = all.filter(
    (c) =>
      !banned.has(c.id) ||
      options.pinned.includes(c.id) ||
      c.family === options.starter,
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
  const weak = new Map(candidates.map((c) => [c, weaknessMask(game, c)]));
  const fieldMask = (c: Candidate) =>
    game.fieldMoves.reduce(
      (mask, move, i) =>
        c.fieldMoves.includes(move.id) ? mask | (1 << i) : mask,
      0,
    );
  const fields = optional.map(fieldMask);
  const needed = options.carryFieldMoves
    ? (1 << game.fieldMoves.length) - 1
    : 0;
  // reachable[i] is the field moves some optional member from i on can carry.
  const reachable = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) reachable[i] = reachable[i + 1] | fields[i];

  const teams: Team[] = [];
  let evaluated = 0;
  const threshold = () =>
    teams.length < limit ? -Infinity : teams[teams.length - 1].score;

  const members: Candidate[] = [];
  const familiesTaken: string[] = [];
  let typesTaken = 0;
  let groupsTaken = 0;
  const clashes = (family: string, typeBits: number, groupBits: number) =>
    familiesTaken.includes(family) ||
    (groupsTaken & groupBits) !== 0 ||
    (options.uniqueTypes && (typesTaken & typeBits) !== 0);
  const join = (
    c: Candidate,
    family: string,
    typeBits: number,
    groupBits: number,
  ) => {
    if (clashes(family, typeBits, groupBits)) return false;
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

  // best[d] is, per opponent, the team's best value after d members. open[d]
  // lists the first openCount[d] opponents below the matchup limit, the only
  // ones a further member can improve.
  const best = Array.from(
    { length: TEAM_SIZE + 1 },
    () => new Float64Array(width),
  );
  best[0].fill(-MATCHUP_LIMIT);
  const open = Array.from(
    { length: TEAM_SIZE + 1 },
    () => new Int32Array(width),
  );
  const openCount = new Int32Array(TEAM_SIZE + 1);
  for (let o = 0; o < width; o++) open[0][o] = o;
  openCount[0] = width;
  const extend = (depth: number, v: Float64Array) => {
    let score = 0;
    let count = 0;
    const next = open[depth + 1];
    for (let o = 0; o < width; o++) {
      const b = Math.max(best[depth][o], v[o]);
      best[depth + 1][o] = b;
      score += b * weights[o];
      if (b < MATCHUP_LIMIT) next[count++] = o;
    }
    openCount[depth + 1] = count;
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
  // alone. Members are taken in index order, so adding member i cannot beat the
  // score plus its gain plus the best `left - 1` gains after it. gains[depth][i]
  // is what optional member i adds at that depth, or -1 if it cannot join;
  // after[depth][i] is that best sum, or -1 if too few members can follow i.
  const gains = Array.from({ length: TEAM_SIZE }, () => new Float64Array(n));
  const after = Array.from({ length: TEAM_SIZE }, () => new Float64Array(n));
  const top = new Float64Array(TEAM_SIZE);
  const explore = (score: number, start: number, carried: number) => {
    const depth = members.length;
    const left = TEAM_SIZE - depth;
    const missing = needed & ~carried;
    const coverable = left === 0 ? 0 : reachable[start];
    if ((coverable & missing) !== missing) return;
    if (left === 0) {
      evaluated++;
      const total =
        score -
        sharedWeaknessPenalty(
          game,
          members.map((c) => weak.get(c)!),
        );
      if (total > threshold()) {
        teams.push({ members: members.map((c) => c.id), score: total });
        teams.sort((a, b) => b.score - a.score);
        if (teams.length > limit) teams.pop();
      }
      return;
    }

    const current = best[depth];
    const gain = gains[depth];
    for (let i = start; i < n; i++) {
      if (clashes(families[i], types[i], groups[i])) {
        gain[i] = -1;
        continue;
      }
      let g = 0;
      const v = value[i];
      const list = open[depth];
      for (let k = 0; k < openCount[depth]; k++) {
        const o = list[k];
        if (v[o] > current[o]) g += (v[o] - current[o]) * weights[o];
      }
      gain[i] = g;
    }

    const rest = after[depth];
    const others = left - 1;
    top.fill(0, 0, others);
    let count = 0;
    let sum = 0;
    for (let i = n - 1; i >= start; i--) {
      rest[i] = count >= others ? sum : -1;
      const g = gain[i];
      if (g < 0) continue;
      count++;
      if (others === 0 || g <= top[others - 1]) continue;
      sum += g - top[others - 1];
      let k = others - 1;
      for (; k > 0 && top[k - 1] < g; k--) top[k] = top[k - 1];
      top[k] = g;
    }

    for (let i = start; i < n; i++) {
      const g = gain[i];
      if (g < 0 || rest[i] < 0 || score + g + rest[i] <= threshold()) continue;
      if (left === 1 && (fields[i] & missing) !== missing) continue;
      const c = optional[i];
      if (!join(c, families[i], types[i], groups[i])) continue;
      explore(extend(depth, value[i]), i + 1, carried | fields[i]);
      leave(types[i], groups[i]);
    }
  };
  let base = 0;
  for (let o = 0; o < width; o++) base += best[members.length][o] * weights[o];
  explore(
    base,
    0,
    required.reduce((mask, c) => mask | fieldMask(c), 0),
  );

  if (
    teams.length === 0 &&
    needed !== 0 &&
    search(game, { ...options, carryFieldMoves: false }, 1).teams.length > 0
  ) {
    throw new Error(
      `No team with these settings keeps a member for ${fieldMoveNames(game)}`,
    );
  }
  return { candidates: all, teams, evaluated };
}

interface Answer {
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
  return (
    total -
    sharedWeaknessPenalty(
      game,
      team.map((c) => weaknessMask(game, c)),
    )
  );
}
