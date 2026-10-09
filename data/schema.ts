// Schema for the hand-curated files in data/games/. The build validates every
// file against it, and `pnpm data:schema` exports it as JSON Schema for editors.
import { z } from "zod";

const identifier = z
  .string()
  .regex(/^[a-z0-9-]+$/, "use the PokeAPI identifier");

const stage = z.int().min(0);

/** A stage, or "postgame" when only reachable after the story. */
const storyStage = z.union([stage, z.literal("postgame")]);

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
    /** A battle after the Champion, scored only when the player asks for them. */
    postgame: z.boolean().default(false),
    party: party.optional(),
    partyByStarter: z.record(identifier, party).optional(),
  })
  .refine((b) => (b.party === undefined) !== (b.partyByStarter === undefined), {
    message: "give exactly one of party or partyByStarter",
  });

export const gameSchema = z.strictObject({
  id: identifier,
  name: z.string(),
  versionGroup: identifier,
  /** The regional Pokédex, or several when the game splits it (Kalos). */
  pokedex: z.union([identifier, z.array(identifier).min(1)]),
  /** Folder under sprites/pokemon/versions/ in PokeAPI's sprite repository. */
  sprites: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/),
  starters: z.array(identifier).min(1),
  exclusiveGroups: z.array(z.array(identifier).min(2)).default([]),
  locations: z.record(
    z
      .string()
      .regex(
        /^[a-z0-9-]+(\/[a-z0-9-]+)?(@[a-z0-9-]+)?$/,
        "use location, location/area, optionally followed by @method",
      ),
    z.union([stage, z.literal("postgame"), z.literal("excluded")]),
  ),
  methods: z.record(identifier, stage).default({}),
  /**
   * In-game trades that need more than their location's stage, or a clearer
   * place name than PokeAPI's. What each trader wants comes from PokeAPI.
   */
  trades: z
    .record(
      identifier,
      z.strictObject({
        stage: stage.optional(),
        /** Where the trader is, when PokeAPI's location name is misleading. */
        place: z.string().optional(),
      }),
    )
    .default({}),
  /**
   * PokeAPI's encounter conditions, by when they can be met. Every condition on
   * an encounter during the story needs an entry; * stands for any text.
   */
  encounterConditions: z
    .record(
      z.string().regex(/^[a-z0-9*-]+$/, "use a PokeAPI condition value"),
      z.union([stage, z.literal("postgame"), z.literal("excluded")]),
    )
    .default({}),
  items: z.record(identifier, storyStage).default({}),
  hms: z.record(identifier, storyStage).default({}),
  /** Moves an evolution needs that a tutor or TM teaches, by when it can. */
  moves: z.record(identifier, storyStage).default({}),
  /** Evolution conditions other than level, item or trade, by when they can be met. */
  conditions: z.strictObject({ beauty: storyStage.optional() }).default({}),
  battles: z.array(battle).min(1),
});

export type GameFile = z.infer<typeof gameSchema>;

export const plannedSchema = z.array(
  z.strictObject({
    versionGroup: identifier,
    name: z.string(),
    sprites: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/),
    starters: z.array(identifier).min(1),
  }),
);
