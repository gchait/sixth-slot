// Schema for the hand-curated files in data/games/ and data/planned.yaml. The
// build validates every file against it, and `pnpm data:schema` exports it,
// descriptions included, as JSON Schema for editors.
import { z } from "zod";

const identifier = z
  .string()
  .regex(/^[a-z0-9-]+$/, "use the PokeAPI identifier");

const stage = z
  .int()
  .min(0)
  .describe(
    "The number of battles under `battles` beaten by then: 0 is before the first.",
  );

const storyStage = z
  .union([stage, z.literal("postgame")])
  .describe(
    "A stage, or postgame when only obtainable in the post-game story.",
  );

const placement = z
  .union([stage, z.literal("postgame"), z.literal("excluded")])
  .describe(
    "A stage; postgame for post-game story areas; excluded for events and rare-day places.",
  );

const locationPlacement = z.union([
  placement,
  z
    .record(identifier, placement)
    .describe(
      "A placement for each version, for a place the versions reach at different times.",
    ),
]);

const spriteFolder = z
  .string()
  .regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/)
  .describe(
    "Folder under sprites/pokemon/versions/ in PokeAPI's sprite repository, with transparent backgrounds.",
  );

const starters = z.array(identifier).min(1);

const pokedex = z
  .array(identifier)
  .min(1)
  .describe("The regional Pokédex, or several when the game splits it.");

const opponent = z.strictObject({
  species: identifier,
  level: z.int().min(1).max(100),
  moves: z.array(identifier).min(1).max(4),
});

const party = z.array(opponent).min(1).max(6);

const battleVariant = z
  .strictObject({
    version: identifier.optional(),
    starter: identifier.optional(),
    name: z.string().optional(),
    party: party.optional(),
  })
  .describe(
    "What players of a version, or with a starter, meet instead: another opponent's name, another party, or both.",
  );

const battle = z.strictObject({
  id: identifier,
  name: z
    .string()
    .optional()
    .describe("The opponent; left out when the variants name every one."),
  title: z.string(),
  postgame: z
    .boolean()
    .default(false)
    .describe(
      "A battle after the story, such as a rematch; scored only when the player asks. These come after every story battle.",
    ),
  party: party
    .optional()
    .describe(
      "The opponent's party; left out when the variants give every one.",
    ),
  variants: z
    .array(battleVariant)
    .default([])
    .describe(
      "Opponents that depend on the version or the player's starter, such as rivals. Each version and starter matches at most one.",
    ),
});

export const gameSchema = z.strictObject({
  name: z.string(),
  versionGroup: identifier,
  pokedex,
  sprites: spriteFolder,
  starters,
  exclusiveGroups: z
    .array(z.array(identifier).min(2))
    .default([])
    .describe(
      "Families of which a playthrough can get only one, such as fossil choices.",
    ),
  giftsByStarter: z
    .record(identifier, identifier)
    .default({})
    .describe(
      "Gifts that depend on the player's starter: the species each starter is given.",
    ),
  locations: z
    .record(
      z
        .string()
        .regex(
          /^[a-z0-9-]+(\/[a-z0-9-]+)?(@[a-z0-9-]+)?$/,
          "use location, location/area, optionally followed by @method",
        ),
      locationPlacement,
    )
    .describe(
      "When each PokeAPI location is first reached on the standard route. location/area narrows a key to an area and @method to an encounter method; the most specific key wins. Every location with encounters needs a key.",
    ),
  methods: z
    .record(identifier, storyStage)
    .default({})
    .describe(
      "Encounter methods that need an item or Badge first; unlisted methods need nothing.",
    ),
  trades: z
    .record(
      identifier,
      z.strictObject({
        stage: stage.optional(),
        place: z
          .string()
          .optional()
          .describe(
            "Where the trader is, when PokeAPI's location name is misleading.",
          ),
      }),
    )
    .default({})
    .describe(
      "In-game trades needing a later stage than their location, or a clearer place name. What each trader wants comes from PokeAPI.",
    ),
  encounterConditions: z
    .record(
      z.string().regex(/^[a-z0-9*-]+$/, "use a PokeAPI condition value"),
      z.union([placement, z.literal("always")]),
    )
    .default({})
    .describe(
      "PokeAPI's encounter conditions, such as the time of day or a fossil. Every condition on a story encounter needs an entry; * matches any text. always counts an encounter only where it is found at the same place, the same way, under every value of its condition, such as in every season. A Game Corner prize (coins-N) is staged where the walkthrough's trainers have paid twice its price in coins at ₽20 each, and excluded if the story pays less.",
    ),
  items: z
    .record(identifier, storyStage)
    .default({})
    .describe(
      "Evolution items and held items, by when they can first be obtained.",
    ),
  hms: z
    .record(identifier, storyStage)
    .default({})
    .describe(
      "HMs that attack, by when they are obtained; HMs can be taught to any number of Pokémon.",
    ),
  fieldMoves: z
    .record(identifier, stage)
    .default({})
    .describe(
      "Moves used outside battle throughout the game, too often to leave to a Pokémon kept only for them, by the stage from which they work outside battle. Teams keep a member that can use each from then on.",
    ),
  moveRelearner: storyStage
    .optional()
    .describe(
      "When the Move Reminder can first reteach level-up moves, paid with items found without grinding; left out if the game has none or its price needs grinding.",
    ),
  moves: z
    .record(identifier, storyStage)
    .default({})
    .describe(
      "Moves an evolution needs that only a tutor or TM teaches, by when it can.",
    ),
  evolutionConditions: z
    .strictObject({ beauty: storyStage.optional() })
    .default({})
    .describe(
      "Evolution conditions other than level, items or trades, by when they can be met.",
    ),
  battles: z
    .array(battle)
    .min(1)
    .describe("The story's major battles in order, then post-game battles."),
});

/** A game file, with the id its file name gives it. */
export type GameFile = z.infer<typeof gameSchema> & { id: string };

export const plannedSchema = z.array(
  z.strictObject({
    versionGroup: identifier,
    name: z.string(),
    pokedex,
    sprites: spriteFolder,
    starters,
  }),
);

/** A game shown as coming soon. */
export type PlannedGame = z.infer<typeof plannedSchema>[number];
