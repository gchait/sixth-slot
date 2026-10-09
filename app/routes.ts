import { type RouteConfig, index, route } from "@react-router/dev/routes";

import { gameIds } from "../scripts/games.ts";

export default [
  index("routes/home.tsx"),
  ...gameIds().map((id) => route(id, "routes/game.tsx", { id })),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
