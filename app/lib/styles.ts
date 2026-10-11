import { cn } from "cn";

/** The focus ring of the site's own clickable elements, matching its buttons. */
export const focusRing =
  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]";

/** A bordered option among several, marked when selected. */
export function choice(selected: boolean): string {
  return cn(
    "rounded-lg border transition-colors",
    focusRing,
    selected ? "border-primary bg-accent" : "hover:bg-accent/50",
  );
}
