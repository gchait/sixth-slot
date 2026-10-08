import { useEffect, useRef, useState } from "react";

import type { Options } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";
import type { SearchRequest, SearchResponse } from "../search.worker.ts";

/** Searches in a worker; returns null while the search for `options` is running. */
export function useSearch(
  game: GameData,
  options: Options,
): SearchResponse | null {
  const worker = useRef<Worker | null>(null);
  const sentGame = useRef<GameData | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const id = JSON.stringify(options);

  useEffect(() => {
    const w = new Worker(new URL("../search.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (event: MessageEvent<SearchResponse>) =>
      setResponse(event.data);
    worker.current = w;
    sentGame.current = null;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const request: SearchRequest = {
      id,
      options: JSON.parse(id) as Options,
      game: sentGame.current === game ? undefined : game,
    };
    sentGame.current = game;
    worker.current?.postMessage(request);
  }, [game, id]);

  return response?.id === id ? response : null;
}
