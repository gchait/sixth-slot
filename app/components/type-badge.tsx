import { cn } from "cn";

const colors: Record<string, string> = {
  normal: "bg-[#a8a878] text-white",
  fighting: "bg-[#c03028] text-white",
  flying: "bg-[#a890f0] text-white",
  poison: "bg-[#a040a0] text-white",
  ground: "bg-[#e0c068] text-neutral-900",
  rock: "bg-[#b8a038] text-white",
  bug: "bg-[#a8b820] text-white",
  ghost: "bg-[#705898] text-white",
  steel: "bg-[#b8b8d0] text-neutral-900",
  fire: "bg-[#f08030] text-white",
  water: "bg-[#6890f0] text-white",
  grass: "bg-[#78c850] text-neutral-900",
  electric: "bg-[#f8d030] text-neutral-900",
  psychic: "bg-[#f85888] text-white",
  ice: "bg-[#98d8d8] text-neutral-900",
  dragon: "bg-[#7038f8] text-white",
  dark: "bg-[#705848] text-white",
  fairy: "bg-[#ee99ac] text-neutral-900",
};

export function TypeBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide",
        colors[type] ?? "bg-muted text-foreground",
        className,
      )}
    >
      {type}
    </span>
  );
}
