import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs text-ink cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        {...props}
        className="h-3.5 w-3.5 cursor-pointer accent-accent"
      />
      {label}
    </label>
  );
}
