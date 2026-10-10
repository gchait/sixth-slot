import type { Candidate } from "../../engine/candidates.ts";
import type { GameData, Source } from "../../engine/data.ts";

/** "Before Brock": a stage, named by the battle it leads to. */
export function stageName(game: GameData, stage: number): string {
  return `Before ${game.battles[stage].name}`;
}

type PlacedSource = Source & { species: string };

/** Sources that differ only in place, merged into one listing every place. */
export function mergePlaces(sources: PlacedSource[]): PlacedSource[] {
  const merged = new Map<string, PlacedSource>();
  for (const source of sources) {
    const gives = "gives" in source ? source.gives : "";
    const key = [source.stage, source.species, source.method, gives].join("|");
    const same = merged.get(key);
    if (!same) {
      merged.set(key, { ...source });
      continue;
    }
    same.location += `, ${source.location}`;
    if ("levels" in same && "levels" in source)
      same.levels = [
        Math.min(same.levels[0], source.levels[0]),
        Math.max(same.levels[1], source.levels[1]),
      ];
  }
  return [...merged.values()];
}

export function describeSource(game: GameData, source: PlacedSource): string {
  const name = game.species[source.species].name;
  if ("gives" in source)
    return `${name} · ${source.location} · trade your ${game.species[source.gives].name}`;
  const [min, max] = source.levels;
  const levels = min === max ? `Lv ${min}` : `Lv ${min}–${max}`;
  return `${name} · ${source.location} · ${source.method.toLowerCase()} · ${levels}`;
}

/** "Charmander → Charmeleon (Lv 16) → Charizard (Lv 36)". */
export function describeLine(game: GameData, candidate: Candidate): string {
  return candidate.line
    .map((species, i) => {
      const name = game.species[species].name;
      if (i === 0) return name;
      if (!candidate.evolves[i - 1]) return `${name} (caught)`;
      const { label } = game.evolutions.find((e) => e.to === species)!;
      return `${name} (${label})`;
    })
    .join(" → ");
}
