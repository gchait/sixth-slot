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

const spriteFolder = z
  .string()
  .regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/)
  .describe(
    "Folder under sprites/pokemon/versions/ in PokeAPI's sprite repository, with transparent backgrounds.",
  );

const starters = z.array(identifier).min(1);

const opponent = z.strictObject({
  species: identifier,
  level: z.int().min(1).max(100),
  moves: z.array(identifier).min(1).max(4),
});

const party = z.array(opponent).min(1).max(6);

const battle = z
  .strictObject({
    id: identifier,
    name: z.string(),
    title: z.string(),
    postgame: z
      .boolean()
      .default(false)
      .describe(
        "A battle after the Champion, such as a rematch; scored only when the player asks. These come after every story battle.",
      ),
    party: party.optional(),
    partyByStarter: z
      .record(identifier, party)
      .optional()
      .describe("Parties keyed by the player's starter, for rivals."),
  })
  .refine((b) => (b.party === undefined) !== (b.partyByStarter === undefined), {
    message: "give exactly one of party or partyByStarter",
  });

export const gameSchema = z.strictObject({
  name: z.string(),
  versionGroup: identifier,
  pokedex: z
    .array(identifier)
    .min(1)
    .describe("The regional Pokédex, or several when the game splits it."),
  sprites: spriteFolder,
  starters,
  exclusiveGroups: z
    .array(z.array(identifier).min(2))
    .default([])
    .describe(
      "Families of which a playthrough can get only one, such as fossil choices.",
    ),
  locations: z
    .record(
      z
        .string()
        .regex(
          /^[a-z0-9-]+(\/[a-z0-9-]+)?(@[a-z0-9-]+)?$/,
          "use location, location/area, optionally followed by @method",
        ),
      placement,
    )
    .describe(
      "When each PokeAPI location is first reached on the standard route. location/area narrows a key to an area and @method to an encounter method; the most specific key wins. Every location with encounters needs a key.",
    ),
  methods: z
    .record(identifier, stage)
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
      placement,
    )
    .default({})
    .describe(
      "PokeAPI's encounter conditions, such as the time of day or a fossil. Every condition on a story encounter needs an entry; * matches any text.",
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
    sprites: spriteFolder,
    starters,
  }),
);
