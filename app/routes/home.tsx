import { readFile } from "node:fs/promises";
import { Link } from "react-router";

import type { GameSummary } from "../../scripts/game-data.ts";
import type { Route } from "./+types/home";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export async function loader() {
  const text = await readFile("generated/games.json", "utf8");
  return {
    games: JSON.parse(text) as GameSummary[],
  };
}

const summary =
  "The best team for a Pokémon playthrough. Pick your starter, and get five teammates the game actually lets you catch, balanced for every major battle of the story.";

export function meta() {
  return [
    { title: "sixth-slot · Pokémon playthrough team planner" },
    { name: "description", content: summary },
  ];
}

const steps = [
  {
    title: "Only what you can get",
    text: "Each member comes from your version's real encounters, gifts and trades, counted from the point in the story you can reach them.",
  },
  {
    title: "Scored against real battles",
    text: "Every Gym Leader, the Elite Four and the story's final battles, using their actual teams and moves and your Pokémon's level-up moves and HMs.",
  },
  {
    title: "Your rules",
    text: "No shared types by default. Pin a favorite, exclude what you dislike, allow legendaries or trade evolutions.",
  },
];

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-4xl space-y-12 px-4 py-12">
      <header className="space-y-3">
        <h1 className="flex items-center gap-3 text-4xl font-bold tracking-tight">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          sixth-slot
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg">{summary}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Choose a game</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {loaderData.games.map((game) => {
            const card = (
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <CardTitle>{game.name}</CardTitle>
                    {game.versions.length > 1 && (
                      <CardDescription>
                        {game.versions.join(" · ")}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex h-14 shrink-0 items-center">
                    {game.starters.map((starter) => (
                      <img
                        key={starter.name}
                        src={starter.url}
                        alt={starter.name}
                        width={starter.width}
                        height={starter.height}
                        style={{
                          width: starter.width,
                          height: starter.height,
                          margin: `${(56 - starter.height) / 2}px ${(48 - starter.width) / 2}px`,
                        }}
                        className="max-w-none [image-rendering:pixelated]"
                      />
                    ))}
                  </div>
                </CardHeader>
              </Card>
            );
            return (
              <li key={game.id}>
                <Link
                  to={`/${game.id}/`}
                  className="block rounded-xl focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]"
                >
                  {card}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="space-y-1">
            <h2 className="font-semibold">{step.title}</h2>
            <p className="text-muted-foreground text-sm">{step.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
