import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "success" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-accent text-accent-foreground",
        tone === "neutral" && "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
