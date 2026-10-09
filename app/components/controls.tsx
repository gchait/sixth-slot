import { X } from "lucide-react";

import type { Options } from "../../engine/candidates.ts";
import { fieldMoveNames, type GameData } from "../../engine/data.ts";
import { Sprite } from "~/components/sprite";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";

function Setting({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Chips({
  game,
  title,
  ids,
  onRemove,
}: {
  game: GameData;
  title: string;
  ids: string[];
  onRemove: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <li key={id}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${game.species[id].name}`}
            >
              {game.species[id].name}
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Controls({
  game,
  options,
  onChange,
}: {
  game: GameData;
  options: Options;
  onChange: (options: Options) => void;
}) {
  const set = (patch: Partial<Options>) => onChange({ ...options, ...patch });
  return (
    <div className="space-y-6">
      {game.versions.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Version</h3>
          <ToggleGroup
            type="single"
            variant="outline"
            value={options.version}
            onValueChange={(version) =>
              version && set({ version, pinned: [], banned: [] })
            }
            className="w-full"
          >
            {game.versions.map((v) => (
              <ToggleGroupItem key={v.id} value={v.id} className="flex-1">
                {v.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Starter</h3>
        <div className="grid grid-cols-3 gap-2">
          {game.starters.map((starter) => {
            const selected = starter === options.starter;
            return (
              <button
                key={starter}
                type="button"
                aria-pressed={selected}
                onClick={() => set({ starter, pinned: [], banned: [] })}
                className={cn(
                  "flex flex-col items-center rounded-lg border p-2 text-xs transition-colors",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  selected
                    ? "border-primary bg-accent font-medium"
                    : "hover:bg-accent/50",
                )}
              >
                <Sprite game={game} species={starter} size={56} />
                {game.species[starter].name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <Setting
          id="unique"
          label="No shared types"
          hint="No two members have a type in common."
          checked={options.uniqueTypes}
          onChange={(uniqueTypes) => set({ uniqueTypes })}
        />
        <Setting
          id="legendaries"
          label="Legendaries"
          hint="Allow legendary Pokémon."
          checked={options.allowLegendaries}
          onChange={(allowLegendaries) => set({ allowLegendaries })}
        />
        <Setting
          id="trades"
          label="Trade evolutions"
          hint="Assume you can trade to evolve, e.g. Kadabra into Alakazam."
          checked={options.allowTradeEvolutions}
          onChange={(allowTradeEvolutions) => set({ allowTradeEvolutions })}
        />
        {game.battles.some((b) => b.postgame) && (
          <Setting
            id="postgame"
            label="Post-game battles"
            hint="Also score rematches and battles after the Champion."
            checked={options.includePostgame}
            onChange={(includePostgame) => set({ includePostgame })}
          />
        )}
        {game.fieldMoves.length > 0 && (
          <Setting
            id="field"
            label={`${fieldMoveNames(game)} on the team`}
            hint="A member can use each outside battle from when it works there."
            checked={options.carryFieldMoves}
            onChange={(carryFieldMoves) => set({ carryFieldMoves })}
          />
        )}
      </div>

      <Chips
        game={game}
        title="Pinned"
        ids={options.pinned}
        onRemove={(id) =>
          set({ pinned: options.pinned.filter((p) => p !== id) })
        }
      />
      <Chips
        game={game}
        title="Excluded"
        ids={options.banned}
        onRemove={(id) =>
          set({ banned: options.banned.filter((b) => b !== id) })
        }
      />
    </div>
  );
}
