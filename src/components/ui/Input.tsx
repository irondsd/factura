import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FIELD_BASE } from "./styles";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(FIELD_BASE, "w-full", className)} />;
}
