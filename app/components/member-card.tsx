import { Ban, Pin, PinOff } from "lucide-react";

import type { Candidate } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";
import { Sprite } from "~/components/sprite";
import { TypeBadge } from "~/components/type-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { describeLine, describeSource, stageName } from "~/lib/describe";

export function MemberCard({
  game,
  candidate,
  isStarter,
  pinned,
  onTogglePin,
  onBan,
}: {
  game: GameData;
  candidate: Candidate;
  isStarter: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onBan: () => void;
}) {
  const species = game.species[candidate.id];
  const [first, ...more] = candidate.sources;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex gap-3 p-4">
        <Sprite
          game={game}
          species={candidate.id}
          size={64}
          className="-my-1"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight">
                {species.name}
              </h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {species.types.map((t) => (
                  <TypeBadge key={t} type={game.types[t]} />
                ))}
              </div>
            </div>
            {!isStarter && (
              <div className="-mr-2 -mt-2 flex shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onTogglePin}
                      aria-pressed={pinned}
                      aria-label={
                        pinned ? `Unpin ${species.name}` : `Pin ${species.name}`
                      }
                    >
                      {pinned ? <PinOff /> : <Pin />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {pinned ? "Unpin" : "Keep in every team"}
                  </TooltipContent>
                </Tooltip>
                {!pinned && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onBan}
                        aria-label={`Exclude ${species.name}`}
                      >
                        <Ban />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Exclude and search again</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {stageName(game, candidate.joins)}
            </Badge>
            {isStarter && <Badge variant="outline">Starter</Badge>}
            {pinned && <Badge variant="outline">Pinned</Badge>}
            {game.fieldMoves
              .filter((move) => candidate.fieldMoves.includes(move.id))
              .map((move) => (
                <Badge key={move.id} variant="outline">
                  {move.name}
                </Badge>
              ))}
          </div>
          {candidate.line.length > 1 && (
            <p className="text-muted-foreground text-xs">
              {describeLine(game, candidate)}
            </p>
          )}
          {first && <p className="text-sm">{describeSource(game, first)}</p>}
          {more.length > 0 && (
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                {more.length} more {more.length === 1 ? "place" : "places"}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {more.map((source, i) => (
                  <li key={i} className="text-muted-foreground text-xs">
                    <span className="text-foreground font-medium">
                      {stageName(game, source.stage)}:
                    </span>{" "}
                    {describeSource(game, source)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
