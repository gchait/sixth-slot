import { useState } from "react";

import { spriteOf, type GameData } from "../../engine/data.ts";
import { cn } from "cn";

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
  // Sprites keep their proportions and are never enlarged. Pixel art shown at
  // its own size stays sharp; one shrunk to fit is smoothed instead.
  const [shrunk, setShrunk] = useState(false);
  return (
    <img
      src={spriteOf(game, species)}
      alt={decorative ? "" : s.name}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      onLoad={(event) =>
        setShrunk(
          Math.max(
            event.currentTarget.naturalWidth,
            event.currentTarget.naturalHeight,
          ) > size,
        )
      }
      className={cn(
        "shrink-0 object-scale-down",
        !shrunk && "[image-rendering:pixelated]",
        className,
      )}
    />
  );
}
