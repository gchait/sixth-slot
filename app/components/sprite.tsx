import { spriteOf, type GameData } from "../../engine/data.ts";
import { cn } from "~/lib/utils";

export function Sprite({
  game,
  species,
  size = 64,
  decorative = false,
  className,
}: {
  game: GameData;
  species: string;
  size?: number;
  /** Next to the species' name in text, so the image needs no alt text. */
  decorative?: boolean;
  className?: string;
}) {
  const s = game.species[species];
  return (
    <img
      src={spriteOf(game, species)}
      alt={decorative ? "" : s.name}
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
