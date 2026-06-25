"use client";

// Small builder-only pieces: a signature/exclusion row, the test-bill drop
// target, the extraction sub-headings, and the two-column field grid.

import { useState } from "react";
import { Button, Input, hint } from "@/components/ui";
import { cn } from "@/lib/cn";

export type Sig = { pattern: string; flags: string };

export function SigRow({
  sig,
  onChange,
  onRemove,
}: {
  sig: Sig;
  onChange: (s: Sig) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex gap-1.5 mb-1.5">
      <Input
        value={sig.pattern}
        placeholder="e.g. AGUAS ANDINAS"
        onChange={(e) => onChange({ ...sig, pattern: e.target.value })}
      />
      <Input
        value={sig.flags}
        placeholder="i"
        className="w-14! flex-none"
        onChange={(e) => onChange({ ...sig, flags: e.target.value })}
      />
      {onRemove && (
        <Button size="sm" variant="ghost" onClick={onRemove}>
          ✕
        </Button>
      )}
    </div>
  );
}

export function DropZone({ onFiles }: { onFiles: (f: FileList) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "mt-2 border border-dashed p-3 text-center font-mono text-micro uppercase tracking-[0.12em] text-muted",
        over ? "border-accent" : "border-line",
      )}
    >
      Drop another bill of this type to test against
    </div>
  );
}

export function SubHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="my-1 mb-2.5">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">
        {label}
      </div>
      {sub && <p className={cn(hint, "mt-0.5")}>{sub}</p>}
    </div>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
  );
}
