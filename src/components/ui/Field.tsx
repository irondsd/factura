import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { microLabel } from "./styles";

/** A labeled form control: the mono caption above an Input/Select/etc. */
export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-[5px]", className)}>
      <span className={microLabel}>{label}</span>
      {children}
    </label>
  );
}
