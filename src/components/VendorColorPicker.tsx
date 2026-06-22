"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  VENDOR_COLOR_NAMES,
  type VendorColorName,
  vendorColorClass,
} from "@/lib/vendorColors";

/** A vendor's color swatch. For owners it's a button that opens a popover of the
 * full palette; clicking a color calls `onChange(name)`. For everyone else (and
 * while no `onChange` is given) it renders as a static, read-only swatch. */
export function VendorColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange?: (name: VendorColorName) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!onChange) {
    return (
      <span
        className={cn("w-[9px] h-[9px] flex-none", vendorColorClass(value))}
      />
    );
  }

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        aria-label="Change color"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "block w-[11px] h-[11px] cursor-pointer border-none p-0 transition-transform hover:scale-125",
          vendorColorClass(value),
        )}
      />
      {open && (
        <div className="absolute z-20 top-[calc(100%+6px)] left-0 grid grid-cols-7 gap-1.5 w-max bg-card border border-line p-2 shadow-pop">
          {VENDOR_COLOR_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              title={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className={cn(
                "w-4 h-4 cursor-pointer p-0 border",
                value === name
                  ? "border-ink"
                  : "border-transparent hover:border-line",
                vendorColorClass(name),
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
