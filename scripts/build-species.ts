// Species in the regional Pokédexes, plus any another step adds, such as a
// battle's opponents, as they were in the game's generation.
import type { Species, StatKey, Stats } from "../engine/data.ts";
import { groupBy, pastFor, type BuildContext } from "./build-context.ts";
import type { MoveCatalog, TypeTable } from "./build-moves.ts";
import { identifierById } from "./pokeapi.ts";

const statIdentifiers: Record<string, StatKey> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

export interface SpeciesCatalog {
  species: Record<string, Species>;
  /** Species ids in the regional Pokédexes. */
  regional: Set<string>;
  /** Records a species by its id, and returns its identifier. */
  addSpecies: (speciesId: string) => string;
  /** The identifier, if it names a regional species; otherwise records why not. */
  regionalSpecies: (identifier: string, context: string) => string | undefined;
}

export function buildSpecies(
  {
    file,
    t,
    errors,
    generation,
    speciesById,
    speciesByIdentifier,
    speciesNames,
    defaultPokemon,
    moveRowsById,
  }: BuildContext,
  { typeIndex }: TypeTable,
  {
    damagingMove,
    learnsets,
    hmUsers,
    fieldMachines,
    fieldLevelUps,
  }: MoveCatalog,
): SpeciesCatalog {
  const pokedexIds = file.pokedex.map((name) => {
    const pokedex = t.pokedexes.find((row) => row.identifier === name);
    if (!pokedex) throw new Error(`unknown pokedex ${name}`);
    return pokedex.id;
  });
  const regional = new Set(
    t.pokemon_dex_numbers
      .filter((row) => pokedexIds.includes(row.pokedex_id))
      .map((row) => row.species_id),
  );
  const abilityNames = identifierById(t.abilities);
  const abilitiesByPokemon = groupBy(t.pokemon_abilities, "pokemon_id");
  const pastAbilitiesByPokemon = groupBy(
    t.pokemon_abilities_past,
    "pokemon_id",
  );
  const typesByPokemon = groupBy(t.pokemon_types, "pokemon_id");
  const pastTypesByPokemon = groupBy(t.pokemon_types_past, "pokemon_id");
  const statsByPokemon = groupBy(t.pokemon_stats, "pokemon_id");
  const pastStatsByPokemon = groupBy(t.pokemon_stats_past, "pokemon_id");
  const statById = new Map(
    t.stats.map((row) => [row.id, statIdentifiers[row.identifier]]),
  );

  const species: Record<string, Species> = {};
  function addSpecies(speciesId: string): string {
    const row = speciesById.get(speciesId)!;
    if (species[row.identifier]) return row.identifier;
    const pokemonId = defaultPokemon.get(speciesId)!;

    const pastTypes = pastFor(
      pastTypesByPokemon.get(pokemonId) ?? [],
      generation,
    );
    const typeRowsForPokemon =
      pastTypes.length > 0 ? pastTypes : typesByPokemon.get(pokemonId)!;
    const speciesTypes: number[] = [];
    for (const typeRow of [...typeRowsForPokemon].sort(
      (a, b) => Number(a.slot) - Number(b.slot),
    )) {
      const index = typeIndex.get(typeRow.type_id);
      if (index === undefined) {
        errors.push(
          `${row.identifier} has type ${typeRow.type_id}, which generation ${generation} lacks`,
        );
      } else {
        speciesTypes.push(index);
      }
    }

    const stats: Partial<Stats> = {};
    const pastStats = groupBy(
      pastStatsByPokemon.get(pokemonId) ?? [],
      "stat_id",
    );
    for (const statRow of statsByPokemon.get(pokemonId)!) {
      const key = statById.get(statRow.stat_id);
      if (!key) continue;
      const past = pastFor(pastStats.get(statRow.stat_id) ?? [], generation);
      stats[key] = Number((past[0] ?? statRow).base_stat);
    }

    // Regular abilities as they were in this generation, slot by slot; a past
    // row without an ability means the slot did not exist yet.
    const abilities: string[] = [];
    const pastAbilities = groupBy(
      pastAbilitiesByPokemon.get(pokemonId) ?? [],
      "slot",
    );
    for (const abilityRow of abilitiesByPokemon.get(pokemonId) ?? []) {
      if (abilityRow.is_hidden === "1") continue;
      const past = pastFor(
        pastAbilities.get(abilityRow.slot) ?? [],
        generation,
      );
      const abilityId =
        past.length > 0 ? past[0].ability_id : abilityRow.ability_id;
      if (generation >= 3 && abilityId)
        abilities.push(abilityNames.get(abilityId)!);
    }

    const learnset: [number, string][] = [];
    for (const moveRow of learnsets.get(pokemonId) ?? []) {
      const move = damagingMove(moveRow.move_id, row.identifier);
      if (move) learnset.push([Number(moveRow.level), move]);
    }
    learnset.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

    const fieldMoveLevels: Record<string, number> = {};
    const knowFrom = (moveRow: Record<string, string>, level: number) => {
      const move = moveRowsById.get(moveRow.move_id)!.identifier;
      fieldMoveLevels[move] = Math.min(fieldMoveLevels[move] ?? level, level);
    };
    for (const moveRow of fieldMachines.get(pokemonId) ?? [])
      knowFrom(moveRow, 1);
    for (const moveRow of fieldLevelUps.get(pokemonId) ?? [])
      knowFrom(moveRow, Math.max(1, Number(moveRow.level)));

    species[row.identifier] = {
      id: row.identifier,
      name: speciesNames.get(speciesId) ?? row.identifier,
      national: Number(speciesId),
      types: speciesTypes,
      stats: stats as Stats,
      legendary: row.is_legendary === "1" || row.is_mythical === "1",
      abilities: [...new Set(abilities)].sort(),
      learnset,
      hms: (hmUsers.get(pokemonId) ?? [])
        .map((m) => moveRowsById.get(m.move_id)!.identifier)
        .sort(),
      fieldMoves: Object.fromEntries(
        Object.entries(fieldMoveLevels).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
    return row.identifier;
  }
  for (const speciesId of regional.keys()) addSpecies(speciesId);

  function regionalSpecies(
    identifier: string,
    context: string,
  ): string | undefined {
    const row = speciesByIdentifier.get(identifier);
    if (!row) errors.push(`${context}: unknown species ${identifier}`);
    else if (!regional.has(row.id))
      errors.push(
        `${context}: ${identifier} is not in the ${file.pokedex.join(" or ")} Pokédex`,
      );
    else return identifier;
    return undefined;
  }

  return { species, regional, addSpecies, regionalSpecies };
}
