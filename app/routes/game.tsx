import { readFile } from "node:fs/promises";
import { useMemo, useState, useSyncExternalStore } from "react";
import { data, Link, useSearchParams } from "react-router";

import type { Options } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";
import { MATCHUP_LIMIT } from "../../engine/battle.ts";
import { explain, type SearchResult } from "../../engine/search.ts";
import type { Route } from "./+types/game";
import { BattleTable } from "~/components/battle-table";
import { Controls } from "~/components/controls";
import { MemberCard } from "~/components/member-card";
import { Sprite } from "~/components/sprite";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { readOptions, writeOptions } from "~/lib/options";
import { useSearch } from "~/lib/use-search";
import { cn } from "~/lib/utils";

export async function loader({ params }: Route.LoaderArgs) {
  try {
    const text = await readFile(`public/data/${params.game}.json`, "utf8");
    return { game: JSON.parse(text) as GameData };
  } catch {
    throw data(null, { status: 404 });
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.game.name ?? "Game";
  return [
    { title: `${name} team planner · sixth-slot` },
    {
      name: "description",
      content: `The best team for a ${name} playthrough: pick your starter and get six Pokémon you can actually catch, scored against every gym leader, the Elite Four and the Champion.`,
    },
  ];
}

const noSubscription = () => () => {};

/** Team score out of 100: the average best matchup over every battle. */
const percent = (score: number) =>
  Math.round((Math.max(0, score) / MATCHUP_LIMIT) * 100);

function Results({
  game,
  options,
  result,
  milliseconds,
  onChange,
}: {
  game: GameData;
  options: Options;
  result: SearchResult;
  milliseconds: number;
  onChange: (options: Options) => void;
}) {
  const [selected, setSelected] = useState(0);
  const team = result.teams[Math.min(selected, result.teams.length - 1)];
  const members = useMemo(
    () =>
      team
        ? team.members.map((id) => result.candidates.find((c) => c.id === id)!)
        : [],
    [team, result],
  );
  const reports = useMemo(
    () => explain(game, options, members),
    [game, options, members],
  );

  if (!team) {
    return (
      <Alert>
        <AlertTitle>No team fits these settings</AlertTitle>
        <AlertDescription>
          Try allowing shared types, or remove some exclusions.
        </AlertDescription>
      </Alert>
    );
  }

  const togglePin = (id: string) =>
    onChange({
      ...options,
      pinned: options.pinned.includes(id)
        ? options.pinned.filter((p) => p !== id)
        : [...options.pinned, id],
    });
  const ban = (id: string) =>
    onChange({ ...options, banned: [...options.banned, id] });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">
            {selected === 0 ? "Best team" : `Team #${selected + 1}`}
            <span className="text-muted-foreground ml-2 text-base font-normal">
              score {percent(team.score)}/100
            </span>
          </h2>
          <p className="text-muted-foreground text-xs">
            {result.candidates.length} Pokémon lines ·{" "}
            {result.evaluated.toLocaleString()} teams scored in{" "}
            {Math.round(milliseconds)} ms
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {members.map((c) => (
            <MemberCard
              key={c.id}
              game={game}
              candidate={c}
              isStarter={c.family === options.starter}
              pinned={options.pinned.includes(c.id)}
              onTogglePin={() => togglePin(c.id)}
              onBan={() => ban(c.id)}
            />
          ))}
        </div>
      </section>

      {result.teams.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Close alternatives</h2>
          <ul className="grid grid-cols-1 gap-2">
            {result.teams.map((t, i) => (
              <li key={t.members.join()}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-current={i === selected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-1 text-left transition-colors",
                    "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                    i === selected
                      ? "border-primary bg-accent"
                      : "hover:bg-accent/50",
                  )}
                >
                  <span className="text-muted-foreground w-6 text-sm">
                    #{i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap">
                    {t.members.map((id) => (
                      <Sprite key={id} game={game} species={id} size={40} />
                    ))}
                  </span>
                  <span className="text-sm tabular-nums">
                    {percent(t.score)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Battle by battle</h2>
          <p className="text-muted-foreground text-sm">
            Each opponent and the member best suited to it, in the form it has
            by then.
          </p>
        </div>
        <BattleTable game={game} reports={reports} />
      </section>
    </div>
  );
}

function Builder({ game }: { game: GameData }) {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const options = useMemo(
    () => readOptions(new URLSearchParams(query), game),
    [query, game],
  );
  const response = useSearch(game, options);
  const change = (next: Options) =>
    setParams(writeOptions(next, game), {
      replace: true,
      preventScrollReset: true,
    });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside>
        <Card className="lg:sticky lg:top-6">
          <CardContent>
            <Controls game={game} options={options} onChange={change} />
          </CardContent>
        </Card>
      </aside>
      <div>
        {response === null ? (
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Searching for teams"
          >
            <Skeleton className="h-7 w-48" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          </div>
        ) : "error" in response ? (
          <Alert variant="destructive">
            <AlertTitle>These settings do not work together</AlertTitle>
            <AlertDescription>
              <p>{response.error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => change({ ...options, pinned: [] })}
              >
                Clear pinned Pokémon
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Results
            key={response.id}
            game={game}
            options={options}
            result={response.result}
            milliseconds={response.milliseconds}
            onChange={change}
          />
        )}
      </div>
    </div>
  );
}

export default function Game({ loaderData }: Route.ComponentProps) {
  const { game } = loaderData;
  // The page is prerendered without URL parameters, so the builder renders only
  // in the browser, where they are known.
  const mounted = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <Link to="/" className="text-muted-foreground text-sm hover:underline">
          ← sixth-slot
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{game.name}</h1>
        <p className="text-muted-foreground max-w-2xl">
          Six Pokémon you can actually get, scored against every gym leader, the
          Elite Four and the Champion, counting each member only from when you
          can catch it.
        </p>
      </header>
      {mounted ? (
        <Builder game={game} />
      ) : (
        <div className="flex gap-2" aria-hidden>
          {game.starters.map((s) => (
            <Sprite key={s} game={game} species={s} size={64} />
          ))}
        </div>
      )}
    </main>
  );
}
