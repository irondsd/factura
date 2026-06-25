import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { microLabel } from "./styles";

/** A standalone mono caption (the `microLabel` style as a block element). */
export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn(microLabel, "mb-1.5", className)}>{children}</p>;
}
