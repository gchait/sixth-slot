// Turns a curated game file plus PokeAPI's tables into the GameData the app loads.
// Every reference in the game file is checked against PokeAPI, and all problems
// are reported together.
import type { GameFile } from "../data/schema.ts";
import type { GameData } from "../engine/data.ts";
import { buildBattles } from "./build-battles.ts";
import { buildContext } from "./build-context.ts";
import { buildEvolutions } from "./build-evolutions.ts";
import { buildMoves, buildTypes } from "./build-moves.ts";
import { buildSources } from "./build-sources.ts";
import { buildSpecies } from "./build-species.ts";
import { spriteUrl, type Tables } from "./pokeapi.ts";

/** Every stage in the game file must leave a battle to fight. */
function checkStages(file: GameFile, battleCount: number, errors: string[]) {
  const checkStage = (where: string, stage: number | string | undefined) => {
    if (typeof stage === "number" && stage >= battleCount)
      errors.push(`${where}: stage ${stage} is after the last battle`);
  };
  for (const [key, placement] of Object.entries(file.locations)) {
    for (const stage of typeof placement === "object"
      ? Object.values(placement)
      : [placement])
      checkStage(`locations.${key}`, stage);
  }
  for (const [key, stage] of Object.entries(file.methods))
    checkStage(`methods.${key}`, stage);
  for (const [key, stage] of Object.entries(file.items))
    checkStage(`items.${key}`, stage);
  for (const [key, stage] of Object.entries(file.hms))
    checkStage(`hms.${key}`, stage);
  for (const [key, stage] of Object.entries(file.fieldMoves))
    checkStage(`fieldMoves.${key}`, stage);
  checkStage("moveRelearner", file.moveRelearner);
  for (const [key, trade] of Object.entries(file.trades))
    checkStage(`trades.${key}`, trade.stage);
  checkStage("evolutionConditions.beauty", file.evolutionConditions.beauty);
}

export function buildGame(file: GameFile, t: Tables): GameData {
  const context = buildContext(file, t);
  const { errors } = context;
  const typeTable = buildTypes(context);
  const moveCatalog = buildMoves(context, typeTable);
  const speciesCatalog = buildSpecies(context, typeTable, moveCatalog);
  const evolutions = buildEvolutions(
    context,
    typeTable,
    moveCatalog,
    speciesCatalog,
  );
  const starters = file.starters.filter((s) =>
    speciesCatalog.regionalSpecies(s, "starters"),
  );
  const battles = buildBattles(context, moveCatalog, speciesCatalog, starters);
  checkStages(file, battles.length, errors);
  const sources = buildSources(context, speciesCatalog, starters);
  const exclusiveGroups = file.exclusiveGroups.map((group) =>
    group.filter((s) => speciesCatalog.regionalSpecies(s, "exclusiveGroups")),
  );

  if (errors.length > 0) {
    throw new Error(
      `${file.id} has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return {
    id: file.id,
    name: file.name,
    generation: context.generation,
    sprite: spriteUrl(file.sprites, "{national}"),
    versions: context.versions,
    types: typeTable.types,
    typeChart: typeTable.typeChart,
    species: speciesCatalog.species,
    moves: moveCatalog.moves,
    evolutions,
    sources,
    hms: moveCatalog.hms,
    fieldMoves: moveCatalog.fieldMoves,
    ...(typeof file.moveRelearner === "number" && {
      moveRelearner: file.moveRelearner,
    }),
    starters,
    exclusiveGroups,
    battles,
  };
}
