import { useEffect, useRef, useState } from "react";

import type { Options } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";
import type { SearchRequest, SearchResponse } from "../search.worker.ts";

/**
 * Searches in a worker; returns null while the search for `options` is
 * running. A search the options have moved on from is stopped rather than left
 * to finish, since the worker answers requests in order.
 */
export function useSearch(
  game: GameData,
  options: Options,
): SearchResponse | null {
  const worker = useRef<Worker | null>(null);
  const sentGame = useRef<GameData | null>(null);
  const pending = useRef(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const id = JSON.stringify(options);

  const start = () => {
    worker.current?.terminate();
    const w = new Worker(new URL("../search.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (event: MessageEvent<SearchResponse>) => {
      pending.current = false;
      setResponse(event.data);
    };
    worker.current = w;
    sentGame.current = null;
    pending.current = false;
  };

  useEffect(() => {
    start();
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    if (pending.current) start();
    const request: SearchRequest = {
      id,
      options: JSON.parse(id) as Options,
      game: sentGame.current === game ? undefined : game,
    };
    sentGame.current = game;
    pending.current = true;
    worker.current?.postMessage(request);
  }, [game, id]);

  return response?.id === id ? response : null;
}
