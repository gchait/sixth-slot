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
  /** Candidate ids every team must include. */
  pinned: string[];
  /** Candidate ids no team may include. */
  banned: string[];
}

export const defaultOptions = {
  uniqueTypes: true,
  allowLegendaries: false,
  allowTradeEvolutions: false,
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
}

function canEvolve(
  evolution: Evolution,
  battle: number,
  game: GameData,
  options: Options,
): boolean {
  const { method } = evolution;
  switch (method.kind) {
    case "level":
      return method.level <= game.battles[battle].aceLevel;
    case "item":
      return method.stage <= battle;
    case "trade":
      return options.allowTradeEvolutions;
  }
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
      source.gives ? (heldFrom.get(source.gives) ?? Infinity) : 0,
    );

  function formsOf(line: string[], steps: Evolution[]): number[] {
    return game.battles.map((_, battle) => {
      let form = -1;
      line.forEach((species, i) => {
        const obtainable = (sources[species] ?? []).some(
          (s) => opensAt(s) <= battle,
        );
        const evolved =
          i > 0 &&
          form === i - 1 &&
          canEvolve(steps[i - 1], battle, game, options);
        if (obtainable || evolved) form = i;
      });
      return form;
    });
  }

  for (let changed = true; changed;) {
    changed = false;
    for (const species of Object.keys(game.species)) {
      const { line, steps } = lineTo(species);
      const first = formsOf(line, steps).findIndex((f) => f >= line.length - 1);
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
    const { line, steps } = lineTo(species);
    const family = line[0];
    if (otherStarters.has(family)) continue;
    if (
      !options.allowLegendaries &&
      line.some((s) => game.species[s].legendary)
    )
      continue;

    const forms = formsOf(line, steps);
    const last = line.length - 1;
    if (!forms.includes(last)) continue;

    // A line that can still evolve is covered by the candidate for its evolution.
    const evolvesFurther = (evolvesInto.get(species) ?? []).some((e) => {
      const next = lineTo(e.to);
      return formsOf(next.line, next.steps).includes(next.line.length - 1);
    });
    if (evolvesFurther) continue;

    candidates.push({
      id: species,
      line,
      family,
      forms,
      joins: forms.findIndex((f) => f >= 0),
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
