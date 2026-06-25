import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FIELD_BASE } from "./styles";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        FIELD_BASE,
        "cursor-pointer appearance-none pr-8",
        "disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
    >
      {children}
    </select>
  );
}
