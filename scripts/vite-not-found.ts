// Makes `vite preview` answer addresses without a file the way the README asks
// of any server for the site: with 404/index.html and status 404. Like React
// Router's own preview middleware, it leaves alone the requests React Router
// makes while prerendering, which it marks with IS_RR_BUILD_REQUEST.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Plugin } from "vite";

export function notFoundPage(): Plugin {
  return {
    name: "sixth-slot:not-found-page",
    configurePreviewServer(server) {
      const root = resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((request, response, next) => {
        const path = join(
          root,
          decodeURIComponent(new URL(request.url!, "http://site").pathname),
        );
        const found =
          existsSync(path) &&
          (statSync(path).isFile() || existsSync(join(path, "index.html")));
        if (found || process.env.IS_RR_BUILD_REQUEST === "yes") return next();
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(readFileSync(join(root, "404/index.html")));
      });
    },
  };
}
