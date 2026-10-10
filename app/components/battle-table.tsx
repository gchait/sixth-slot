import type { Options } from "../../engine/candidates.ts";
import { met, type GameData } from "../../engine/data.ts";
import type { BattleReport } from "../../engine/search.ts";
import { Sprite } from "~/components/sprite";
import { cn } from "cn";

/** How a matchup score reads to a player. */
function rating(score: number | null): {
  label: string;
  className: string;
} {
  if (score === null)
    return { label: "No answer", className: "text-destructive" };
  if (score >= 1)
    return {
      label: "Strong",
      className: "text-emerald-600 dark:text-emerald-400",
    };
  if (score >= 0)
    return { label: "Even", className: "text-amber-600 dark:text-amber-400" };
  return { label: "Risky", className: "text-destructive" };
}

export function BattleTable({
  game,
  options,
  reports,
}: {
  game: GameData;
  options: Options;
  reports: BattleReport[];
}) {
  return (
    <div className="divide-y rounded-xl border">
      {reports.map((report) => {
        const battle = game.battles[report.battle];
        const overall = rating(report.score);
        return (
          <section
            key={battle.id}
            className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
          >
            <header className="flex items-baseline justify-between gap-2 sm:block">
              <h3 className="font-semibold">{met(battle, options).name}</h3>
              <p className="text-muted-foreground text-xs">
                {battle.title} ·{" "}
                <span className={cn("font-medium", overall.className)}>
                  {overall.label}
                </span>
              </p>
            </header>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {report.answers.map((answer, i) => {
                const r = rating(answer.matchup?.score ?? null);
                const opponent = game.species[answer.opponent.species];
                return (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Sprite
                      game={game}
                      species={opponent.id}
                      size={32}
                      decorative
                      className="self-start"
                    />
                    <span className="min-w-0 flex-1">
                      {opponent.name}{" "}
                      <span className="text-muted-foreground">
                        Lv {answer.opponent.level}
                      </span>
                      {answer.form && (
                        <>
                          <span className="text-muted-foreground" aria-hidden>
                            {" "}
                            ←{" "}
                          </span>
                          <span className="sr-only">, answered by </span>
                          {game.species[answer.form].name}
                          {answer.matchup?.move && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {game.moves[answer.matchup.move].name}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium",
                        r.className,
                      )}
                    >
                      {r.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
