import type { Candidate } from "../../engine/candidates.ts";
import type { GameData, Source } from "../../engine/data.ts";

/** "Before Brock": a stage, named by the battle it leads to. */
export function stageName(game: GameData, stage: number): string {
  return `Before ${game.battles[stage].name}`;
}

export function describeSource(
  game: GameData,
  source: Source & { species: string },
): string {
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
      const { label } = game.evolutions.find((e) => e.to === species)!;
      return `${name} (${label})`;
    })
    .join(" → ");
}
