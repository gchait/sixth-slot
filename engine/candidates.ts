// Builds the Pokémon a team can be made of. A candidate is an evolution line
// ending at a species that does not evolve further under the chosen options,
// together with the form the player would have at each battle.
import type { Evolution, GameData, Source } from "./data.ts";

export interface Options {
  version: string;
  starter: string;
  /** No two members may share a type. */
  uniqueTypes: boolean;
  allowLegendaries: boolean;
  allowTradeEvolutions: boolean;
  /** Also score the battles after the Champion. */
  includePostgame: boolean;
  /** Some member can use each of the game's field moves from when it works. */
  carryFieldMoves: boolean;
  /** Candidate ids every team must include. */
  pinned: string[];
  /** Candidate ids no team may include. */
  banned: string[];
}

export const defaultOptions = {
  uniqueTypes: true,
  allowLegendaries: false,
  allowTradeEvolutions: false,
  includePostgame: false,
  carryFieldMoves: true,
  pinned: [],
  banned: [],
} satisfies Partial<Options>;

export interface Candidate {
  /** The final species of the line. */
  id: string;
  /** Species from the line's first member to its final species. */
  line: string[];
  /** The first species of the line; at most one member per family. */
  family: string;
  /**
   * For each battle, the index into `line` of the form the player has by then,
   * or -1 when no member of the line is obtainable yet.
   */
  forms: number[];
  /** The first battle the line can join, as an index into GameData.battles. */
  joins: number;
  /**
   * Where to get each member of the line, earliest first. A trade's stage
   * includes waiting for the species it asks for.
   */
  sources: (Source & { species: string })[];
  /** The game's field moves the line can use from when each works on. */
  fieldMoves: string[];
}

export function buildCandidates(game: GameData, options: Options): Candidate[] {
  const sources = game.sources[options.version];
  if (!sources) throw new Error(`${game.id} has no version ${options.version}`);
  if (!game.starters.includes(options.starter)) {
    throw new Error(`${options.starter} is not a starter in ${game.id}`);
  }

  const evolvesFrom = new Map(game.evolutions.map((e) => [e.to, e]));
  const evolvesInto = new Map<string, Evolution[]>();
  for (const e of game.evolutions)
    evolvesInto.set(e.from, [...(evolvesInto.get(e.from) ?? []), e]);

  function lineTo(species: string): { line: string[]; steps: Evolution[] } {
    const line = [species];
    const steps: Evolution[] = [];
    for (let e = evolvesFrom.get(species); e; e = evolvesFrom.get(e.from)) {
      line.unshift(e.from);
      steps.unshift(e);
    }
    return { line, steps };
  }

  // The first battle each species can be held for. An in-game trade opens only
  // once the player can hold the species it asks for, so this repeats until
  // nothing changes.
  const heldFrom = new Map<string, number>();
  const opensAt = (source: Source) =>
    Math.max(
      source.stage,
      "gives" in source ? (heldFrom.get(source.gives) ?? Infinity) : 0,
    );

  const heldBy = (species: string | undefined, battle: number) =>
    species !== undefined && (heldFrom.get(species) ?? Infinity) <= battle;

  /**
   * Whether a Pokémon held since battle `heldSince` can evolve by `battle`.
   * Friendship takes time to build, so it counts from the battle after.
   */
  function canEvolve(evolution: Evolution, battle: number, heldSince: number) {
    const r = evolution.requires;
    return (
      (r.level === undefined || r.level <= game.battles[battle].aceLevel) &&
      (r.stage === undefined || r.stage <= battle) &&
      (!r.trade || options.allowTradeEvolutions) &&
      (!r.friendship || heldSince < battle) &&
      (r.species === undefined || heldBy(r.species, battle)) &&
      (r.partyType === undefined ||
        Object.values(game.species).some(
          (s) => s.types.includes(r.partyType!) && heldBy(s.id, battle),
        ))
    );
  }

  function formsOf(line: string[], steps: Evolution[]): number[] {
    const heldSince = line.map(() => Infinity);
    return game.battles.map((_, battle) => {
      let form = -1;
      line.forEach((species, i) => {
        const obtainable = (sources[species] ?? []).some(
          (s) => opensAt(s) <= battle,
        );
        const evolved =
          i > 0 &&
          form === i - 1 &&
          canEvolve(steps[i - 1], battle, heldSince[i - 1]);
        if (obtainable || evolved) form = i;
        if (form === i) heldSince[i] = Math.min(heldSince[i], battle);
      });
      return form;
    });
  }

  function formsTo(species: string): { line: string[]; forms: number[] } {
    const { line, steps } = lineTo(species);
    return { line, forms: formsOf(line, steps) };
  }

  /** The first battle the species itself can be held for, or -1. */
  function firstHeld(species: string): number {
    const { line, forms } = formsTo(species);
    return forms.indexOf(line.length - 1);
  }

  for (let changed = true; changed;) {
    changed = false;
    for (const species of Object.keys(game.species)) {
      const first = firstHeld(species);
      if (first >= 0 && first < (heldFrom.get(species) ?? Infinity)) {
        heldFrom.set(species, first);
        changed = true;
      }
    }
  }

  const otherStarters = new Set(
    game.starters.filter((s) => s !== options.starter),
  );
  const candidates: Candidate[] = [];
  for (const species of Object.keys(game.species)) {
    const { line, forms } = formsTo(species);
    const family = line[0];
    if (otherStarters.has(family)) continue;
    if (
      !options.allowLegendaries &&
      line.some((s) => game.species[s].legendary)
    )
      continue;

    const last = line.length - 1;
    if (!forms.includes(last)) continue;
    const joins = forms.findIndex((f) => f >= 0);
    if (game.battles[joins].postgame && !options.includePostgame) continue;

    // A line that can still evolve is covered by the candidate for its evolution.
    const evolvesFurther = (evolvesInto.get(species) ?? []).some(
      (e) => firstHeld(e.to) >= 0,
    );
    if (evolvesFurther) continue;

    candidates.push({
      id: species,
      line,
      family,
      forms,
      joins,
      fieldMoves: game.fieldMoves
        .filter((move) => {
          // A move once learned stays known, so a line that can use the move
          // when it starts to work keeps it from then on.
          const form = forms[move.stage];
          const level = game.battles[move.stage].aceLevel;
          return line
            .slice(0, form + 1)
            .some(
              (s) => (game.species[s].fieldMoves[move.id] ?? Infinity) <= level,
            );
        })
        .map((move) => move.id),
      sources: line
        .flatMap((s) =>
          (sources[s] ?? [])
            .filter((source) => opensAt(source) < game.battles.length)
            .map((source) => ({
              ...source,
              species: s,
              stage: opensAt(source),
            })),
        )
        .sort((a, b) => a.stage - b.stage),
    });
  }
  return candidates;
}
