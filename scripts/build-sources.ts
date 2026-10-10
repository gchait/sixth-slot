// Where and when each regional species can be obtained in each version: every
// PokeAPI encounter placed at the stage the game file gives its location,
// method and conditions.
import type { Source } from "../engine/data.ts";
import {
  groupBy,
  indexBy,
  inVersion,
  type BuildContext,
} from "./build-context.ts";
import type { SpeciesCatalog } from "./build-species.ts";
import { englishNames, identifierById } from "./pokeapi.ts";

/** Encounter methods that give one Pokémon, which cannot be found again. */
const oneTimeMethods = new Set([
  "gift",
  "gift-egg",
  "npc-trade",
  "static",
  "pokeflute",
  "squirt-bottle",
]);

/** Lowercase without accents and with "Mount" shortened, for comparing names. */
function plain(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bmount\b/g, "mt.");
}

/** PokeAPI's English name, with Pokémon and the Poké Flute spelled as in the games. */
const pokemonSpelling = (name: string) =>
  name.replace(/\bPokemon\b/g, "Pokémon").replace("Pokéflute", "Poké Flute");

/** An encounter method's name, with PokeAPI's capitalized ambush places in lowercase. */
const methodName = (name: string) =>
  pokemonSpelling(name).replace(
    /^Ambushed by a Wild Pokémon from (a|the) (.+)$/,
    (_, article: string, place: string) =>
      `Ambushed by a wild Pokémon from ${article} ${place.toLowerCase()}`,
  );

/** Every location key must exist in PokeAPI. */
function checkLocationKeys({ file, t, errors }: BuildContext) {
  const locationsByIdentifier = indexBy(t.locations, "identifier");
  const areasByLocation = groupBy(t.location_areas, "location_id");
  const methodIdentifiers = new Set(
    t.encounter_methods.map((row) => row.identifier),
  );
  for (const key of [
    ...Object.keys(file.locations),
    ...Object.keys(file.wrongEncounters),
  ]) {
    const [place, method] = key.split("@");
    const [location, area] = place.split("/");
    if (method && !methodIdentifiers.has(method))
      errors.push(`locations: unknown encounter method ${method} in ${key}`);
    const row = locationsByIdentifier.get(location);
    if (!row) errors.push(`locations: unknown location ${location}`);
    else if (
      area &&
      !(areasByLocation.get(row.id) ?? []).some((a) => a.identifier === area)
    ) {
      errors.push(`locations: ${location} has no area ${area}`);
    }
  }
  for (const method of Object.keys(file.methods)) {
    if (!methodIdentifiers.has(method))
      errors.push(`methods: unknown encounter method ${method}`);
  }
}

export function buildSources(
  context: BuildContext,
  { regional, regionalSpecies }: SpeciesCatalog,
  starters: string[],
): Record<string, Record<string, Source[]>> {
  checkLocationKeys(context);
  const {
    file,
    t,
    errors,
    versionGroup,
    speciesById,
    pokemonSpecies,
    locationsById,
    locationNames,
  } = context;
  const slots = indexBy(t.encounter_slots, "id");
  const methodsById = indexBy(t.encounter_methods, "id");
  const methodNames = englishNames(
    t.encounter_method_prose,
    "encounter_method_id",
  );
  const areas = indexBy(t.location_areas, "id");
  const areaNames = englishNames(t.location_area_prose, "location_area_id");
  const unmapped = new Set<string>();
  const usedTrades = new Set<string>();
  const conditionValues = identifierById(t.encounter_condition_values);
  const conditionsByEncounter = groupBy(
    t.encounter_condition_value_map,
    "encounter_id",
  );
  const conditionRules = Object.entries(file.encounterConditions).map(
    ([pattern, placement]) => ({
      matches: new RegExp(`^${pattern.replaceAll("*", ".*")}$`),
      placement,
    }),
  );
  const ruleFor = (condition: string) =>
    conditionRules.find((r) => r.matches.test(condition));
  const conditionsOf = (encounter: Record<string, string>) =>
    (conditionsByEncounter.get(encounter.id) ?? []).map((row) =>
      conditionValues.get(row.encounter_condition_value_id)!,
    );
  const valueRows = indexBy(t.encounter_condition_values, "identifier");
  const valuesByCondition = groupBy(
    t.encounter_condition_values,
    "encounter_condition_id",
  );
  /** An encounter apart from its conditions ruled "always". */
  const sameEncounter = (
    encounter: Record<string, string>,
    conditions: string[],
  ) =>
    [
      encounter.version_id,
      encounter.location_area_id,
      slots.get(encounter.encounter_slot_id)!.encounter_method_id,
      encounter.pokemon_id,
      ...conditions.filter((c) => ruleFor(c)?.placement !== "always").sort(),
    ].join("|");
  /** The values of "always" conditions each encounter is found under. */
  const foundUnder = new Map<string, Set<string>>();
  for (const encounter of t.encounters) {
    const conditions = conditionsOf(encounter);
    for (const condition of conditions) {
      if (ruleFor(condition)?.placement !== "always") continue;
      const key = sameEncounter(encounter, conditions);
      foundUnder.set(key, (foundUnder.get(key) ?? new Set()).add(condition));
    }
  }
  const unmappedConditions = new Set<string>();
  const matchedWrong = new Set<string>();
  const sources: Record<string, Record<string, Source[]>> = {};
  for (const version of t.versions.filter(
    (v) => v.version_group_id === versionGroup.id,
  )) {
    const merged = new Map<string, Source & { species: string }>();
    for (const encounter of t.encounters.filter(
      (e) => e.version_id === version.id,
    )) {
      const area = areas.get(encounter.location_area_id)!;
      const location = locationsById.get(area.location_id)!;
      const method = methodsById.get(
        slots.get(encounter.encounter_slot_id)!.encounter_method_id,
      )!;
      const inArea = `${location.identifier}/${area.identifier}`;
      const keys = [
        `${inArea}@${method.identifier}`,
        `${location.identifier}@${method.identifier}`,
        inArea,
        location.identifier,
      ];
      const pokemon = speciesById.get(
        pokemonSpecies.get(encounter.pokemon_id)!,
      )!.identifier;
      const wrong = keys.find((key) =>
        file.wrongEncounters[key]?.includes(pokemon),
      );
      if (wrong) {
        matchedWrong.add(`${wrong} ${pokemon}`);
        continue;
      }
      const placement = inVersion(
        keys.map((key) => file.locations[key]).find((p) => p !== undefined),
        version.identifier,
      );
      if (placement === undefined) {
        unmapped.add(
          location.identifier + (area.identifier ? `/${area.identifier}` : ""),
        );
        continue;
      }
      const methodStage = file.methods[method.identifier] ?? 0;
      if (
        placement === "postgame" ||
        placement === "excluded" ||
        methodStage === "postgame"
      )
        continue;
      const speciesId = pokemonSpecies.get(encounter.pokemon_id)!;
      if (!regional.has(speciesId)) continue;

      const speciesIdentifier = speciesById.get(speciesId)!.identifier;
      let stage = Math.max(placement, methodStage);
      let gives: string | undefined;
      let givesAny = false;
      let place: string | undefined;
      const conditions = conditionsOf(encounter);
      if (method.identifier === "npc-trade") {
        // The trade's condition names the species the trader wants.
        const wanted = conditions.filter((c) => c.startsWith("trade-"));
        if (wanted.length !== 1) {
          errors.push(
            `${speciesIdentifier} is traded at ${location.identifier} without exactly one trade condition`,
          );
          continue;
        }
        const species = wanted[0].slice("trade-".length);
        if (species === "any-pokemon") givesAny = true;
        else gives = regionalSpecies(species, `trade for ${speciesIdentifier}`);
        const trade = file.trades[speciesIdentifier];
        if (trade) {
          usedTrades.add(speciesIdentifier);
          stage = Math.max(stage, trade.stage ?? 0);
          place = trade.place;
        }
      }
      let available = true;
      for (const condition of conditions) {
        if (condition.startsWith("trade-")) continue;
        const rule = ruleFor(condition);
        if (!rule) unmappedConditions.add(condition);
        if (rule?.placement === "always") {
          const found = foundUnder.get(sameEncounter(encounter, conditions))!;
          const values = valuesByCondition.get(
            valueRows.get(condition)!.encounter_condition_id,
          )!;
          if (!values.every((v) => found.has(v.identifier))) available = false;
        } else if (!rule || typeof rule.placement !== "number")
          available = false;
        else stage = Math.max(stage, rule.placement);
      }
      if (!available) continue;
      const locationName = pokemonSpelling(
        locationNames.get(location.id) ?? location.identifier,
      );
      // A one-time encounter also names its area, without a parenthesized floor
      // or route number at the end.
      const once = oneTimeMethods.has(method.identifier);
      const areaName =
        area.identifier && once
          ? pokemonSpelling(areaNames.get(area.id) ?? "").replace(
              / \([^()]*\)$/,
              "",
            )
          : undefined;
      const levels: [number, number] = [
        Number(encounter.min_level),
        Number(encounter.max_level),
      ];
      const source: Source & { species: string } = {
        species: speciesIdentifier,
        stage,
        location: place
          ? place
          : !areaName || plain(areaName) === plain(locationName)
            ? locationName
            : plain(areaName).includes(plain(locationName))
              ? areaName
              : `${locationName} (${areaName})`,
        method: methodName(methodNames.get(method.id) ?? method.identifier),
        ...(once && { once }),
        ...(gives
          ? { gives }
          : givesAny
            ? { givesAny: true as const }
            : { levels }),
      };
      const key = `${source.species}|${source.location}|${source.method}|${stage}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, source);
      } else {
        if ("levels" in existing && "levels" in source) {
          existing.levels = [
            Math.min(existing.levels[0], source.levels[0]),
            Math.max(existing.levels[1], source.levels[1]),
          ];
        }
      }
    }
    const bySpecies: Record<string, Source[]> = {};
    for (const { species: id, ...source } of merged.values())
      (bySpecies[id] ??= []).push(source);
    for (const list of Object.values(bySpecies)) {
      list.sort(
        (a, b) => a.stage - b.stage || a.location.localeCompare(b.location),
      );
    }
    sources[version.identifier] = bySpecies;
  }
  for (const location of unmapped)
    errors.push(`locations: ${location} has encounters but no stage`);
  for (const condition of unmappedConditions)
    errors.push(
      `encounterConditions: ${condition} applies to an encounter but has no stage`,
    );
  for (const [key, species] of Object.entries(file.wrongEncounters)) {
    for (const pokemon of species) {
      if (!matchedWrong.has(`${key} ${pokemon}`))
        errors.push(`wrongEncounters: PokeAPI has no ${pokemon} at ${key}`);
    }
  }
  for (const traded of Object.keys(file.trades)) {
    if (!usedTrades.has(traded))
      errors.push(`trades: ${traded} is not traded during the story`);
  }

  for (const [starter, gift] of Object.entries(file.giftsByStarter)) {
    if (!starters.includes(starter))
      errors.push(`giftsByStarter: ${starter} is not a starter`);
    const gifts = Object.values(sources)
      .flatMap((bySpecies) => bySpecies[gift] ?? [])
      .filter((source) => source.once && !("gives" in source));
    if (gifts.length === 0)
      errors.push(`giftsByStarter: ${gift} is not a gift`);
    for (const source of gifts) source.starter = starter;
  }
  return sources;
}
