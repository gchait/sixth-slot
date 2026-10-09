// Schema for the hand-curated files in data/games/. The build validates every
// file against it, and `pnpm data:schema` exports it as JSON Schema for editors.
import { z } from "zod";

const identifier = z
  .string()
  .regex(/^[a-z0-9-]+$/, "use the PokeAPI identifier");

const stage = z.int().min(0);

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
  pokedex: identifier,
  /** Folder under sprites/pokemon/versions/ in PokeAPI's sprite repository. */
  sprites: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
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
  trades: z
    .record(
      identifier,
      z.strictObject({
        gives: z.union([identifier, z.record(identifier, identifier)]),
        stage: stage.optional(),
        /** Where the trader is, when PokeAPI's location name is misleading. */
        place: z.string().optional(),
      }),
    )
    .default({}),
  items: z.record(identifier, stage).default({}),
  hms: z.record(identifier, stage).default({}),
  /** Evolution conditions other than level, item or trade, by when they can be met. */
  conditions: z.strictObject({ beauty: stage.optional() }).default({}),
  battles: z.array(battle).min(1),
});

export type GameFile = z.infer<typeof gameSchema>;
