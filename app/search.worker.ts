// Runs team searches off the main thread so the page stays responsive.
import type { Options } from "../engine/candidates.ts";
import type { GameData } from "../engine/data.ts";
import { search, type SearchResult } from "../engine/search.ts";

/** The game is sent with the first request only. */
export type SearchRequest = { id: string; game?: GameData; options: Options };

export type SearchResponse =
  | { id: string; result: SearchResult; milliseconds: number }
  | { id: string; error: string };

let game: GameData | undefined;

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { id, options } = event.data;
  game = event.data.game ?? game;
  const started = performance.now();
  try {
    const result = search(game!, options);
    postMessage({
      id,
      result,
      milliseconds: performance.now() - started,
    } satisfies SearchResponse);
  } catch (error) {
    postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies SearchResponse);
  }
};
