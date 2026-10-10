// The game's major battles, each opponent's party reduced to its damaging
// moves, and each battle's level: that of the strongest opponent so far.
import type { GameFile } from "../data/schema.ts";
import {
  met,
  type Battle,
  type BattleVariant,
  type Opponent,
} from "../engine/data.ts";
import type { BuildContext } from "./build-context.ts";
import type { MoveCatalog } from "./build-moves.ts";
import type { SpeciesCatalog } from "./build-species.ts";

export function buildBattles(
  {
    file,
    errors,
    versionIds,
    speciesByIdentifier,
    moveIdsByIdentifier,
  }: BuildContext,
  { damagingMove }: MoveCatalog,
  { addSpecies }: SpeciesCatalog,
  starters: string[],
): Battle[] {
  function opponents(
    party: GameFile["battles"][number]["party"] & object,
    context: string,
  ): Opponent[] {
    return party.map((member) => {
      const row = speciesByIdentifier.get(member.species);
      if (!row) errors.push(`${context}: unknown species ${member.species}`);
      const damagingMoves: string[] = [];
      for (const move of member.moves) {
        const moveId = moveIdsByIdentifier.get(move);
        if (!moveId) {
          errors.push(`${context}: unknown move ${move}`);
          continue;
        }
        const damaging = damagingMove(moveId, context);
        if (damaging) damagingMoves.push(damaging);
      }
      return {
        species: row ? addSpecies(row.id) : member.species,
        level: member.level,
        moves: damagingMoves,
      };
    });
  }

  let level = 0;
  const battles: Battle[] = file.battles.map((battle) => {
    const variants: BattleVariant[] = battle.variants.map((variant, i) => {
      const context = `${battle.id} variant ${i + 1}`;
      if (variant.version && !versionIds.includes(variant.version))
        errors.push(`${context}: ${variant.version} is not a version`);
      if (variant.starter && !starters.includes(variant.starter))
        errors.push(`${context}: ${variant.starter} is not a starter`);
      return {
        ...(variant.version && { version: variant.version }),
        ...(variant.starter && { starter: variant.starter }),
        ...(variant.name && { name: variant.name }),
        ...(variant.party && { party: opponents(variant.party, context) }),
      };
    });
    const built: Battle = {
      id: battle.id,
      ...(battle.name && { name: battle.name }),
      title: battle.title,
      postgame: battle.postgame,
      level: 0,
      ...(battle.party && { party: opponents(battle.party, battle.id) }),
      ...(variants.length > 0 && { variants }),
    };
    for (const version of versionIds) {
      for (const starter of starters) {
        const player = `${version} with ${starter}`;
        const matching = variants.filter(
          (v) =>
            (v.version === undefined || v.version === version) &&
            (v.starter === undefined || v.starter === starter),
        );
        if (matching.length > 1)
          errors.push(`${battle.id}: several variants for ${player}`);
        const { name, party } = met(built, { version, starter });
        if (name === undefined)
          errors.push(`${battle.id}: no name for ${player}`);
        if (party === undefined)
          errors.push(`${battle.id}: no party for ${player}`);
      }
    }
    level = Math.max(
      level,
      ...[built.party, ...variants.map((v) => v.party)]
        .flat()
        .map((o) => o?.level ?? 0),
    );
    built.level = level;
    return built;
  });

  const firstPostgame = battles.findIndex((b) => b.postgame);
  if (
    firstPostgame >= 0 &&
    battles.slice(firstPostgame).some((b) => !b.postgame)
  )
    errors.push(
      "battles: post-game battles must come after every story battle",
    );
  return battles;
}
