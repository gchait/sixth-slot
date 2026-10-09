import type { Candidate } from "../../engine/candidates.ts";
import type { GameData, Source } from "../../engine/data.ts";

/** "Before Brock", or "Before the Elite Four" for the first Elite Four battle. */
export function stageName(game: GameData, stage: number): string {
  const battle = game.battles[stage];
  if (!battle) return "After the Champion";
  const firstOfTitle =
    game.battles.findIndex((b) => b.title === battle.title) === stage;
  if (battle.title === "Elite Four" && firstOfTitle)
    return "Before the Elite Four";
  return `Before ${battle.name}`;
}

export function describeSource(
  game: GameData,
  source: Source & { species: string },
): string {
  const levels =
    source.minLevel === source.maxLevel
      ? `Lv ${source.minLevel}`
      : `Lv ${source.minLevel}–${source.maxLevel}`;
  const name = game.species[source.species].name;
  if (source.gives)
    return `${name} · ${source.location} · trade your ${game.species[source.gives].name}`;
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
