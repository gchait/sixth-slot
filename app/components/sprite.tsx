import type { GameData } from "../../engine/data.ts";
import { cn } from "~/lib/utils";

export function Sprite({
  game,
  species,
  size = 64,
  className,
}: {
  game: GameData;
  species: string;
  size?: number;
  className?: string;
}) {
  const s = game.species[species];
  return (
    <img
      src={game.sprite.replace("{national}", String(s.national))}
      alt={s.name}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      className={cn(
        "shrink-0 self-start [image-rendering:pixelated]",
        className,
      )}
    />
  );
}
