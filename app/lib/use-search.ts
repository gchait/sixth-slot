import { useEffect, useRef, useState } from "react";

import type { Options } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";
import type { SearchRequest, SearchResponse } from "../search.worker.ts";

/** A search's answer, or that the worker failed before it could give one. */
export type SearchOutcome = SearchResponse | { id: string; failed: true };

/**
 * Searches in a worker; returns null while the search for `options` is
 * running. A search the options have moved on from is stopped rather than left
 * to finish, since the worker answers requests in order, and so is a worker
 * that failed.
 */
export function useSearch(
  game: GameData,
  options: Options,
): SearchOutcome | null {
  const worker = useRef<Worker | null>(null);
  const sentGame = useRef<GameData | null>(null);
  const pending = useRef(false);
  const requested = useRef("");
  const [response, setResponse] = useState<SearchOutcome | null>(null);
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
    w.onerror = () => setResponse({ id: requested.current, failed: true });
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
    requested.current = id;
    worker.current?.postMessage(request);
  }, [game, id]);

  return response?.id === id ? response : null;
}
