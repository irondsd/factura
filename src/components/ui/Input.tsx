import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";
import { FIELD_BASE } from "./styles";

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input ref={ref} {...props} className={cn(FIELD_BASE, "w-full", className)} />
  );
}
