import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
      },
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> &
  Required<VariantProps<typeof badgeVariants>>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
