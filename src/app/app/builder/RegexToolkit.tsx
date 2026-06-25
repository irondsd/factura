"use client";

// The collapsible regex helper under the bill text: a library of copy-ready
// recipes (live-matched against the current bill) and a free-form tester.

import { useState } from "react";
import { Input, hint, microLabel, tabClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ValueChip } from "./cards";
import { REGEX_RECIPES, recipeMatch, testerMatches } from "./recipes";

export function RegexToolkit({
  text,
  onCopy,
}: {
  text: string;
  onCopy: (pattern: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"recipes" | "tester">("recipes");
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("i");
  const result = testerMatches(text, pattern, flags);
  return (
    <div className="mt-4 border border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-2 px-3 font-mono text-micro uppercase tracking-label text-accent cursor-pointer"
      >
        <span>Regex toolkit</span>
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <button
              onClick={() => setTab("recipes")}
              className={tabClass(tab === "recipes")}
            >
              Recipes
            </button>
            <button
              onClick={() => setTab("tester")}
              className={tabClass(tab === "tester")}
            >
              Tester
            </button>
          </div>
          {tab === "recipes" ? (
            <div className="flex flex-col gap-3">
              {REGEX_RECIPES.map((sec) => (
                <div key={sec.group}>
                  <span className={microLabel}>{sec.group}</span>
                  <div className="flex flex-col gap-1 mt-1">
                    {sec.items.map((r) => {
                      const hitv = recipeMatch(text, r);
                      return (
                        <button
                          key={r.label}
                          onClick={() => onCopy(r.pattern)}
                          title="Copy pattern"
                          className="text-left border border-line hover:border-ink transition-colors py-1.5 px-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-ink">
                              {r.label}
                            </span>
                            {hitv !== undefined ? (
                              <ValueChip
                                value={
                                  hitv.length > 16
                                    ? `${hitv.slice(0, 15)}…`
                                    : hitv
                                }
                                size="sm"
                              />
                            ) : (
                              <span className={hint}>no match</span>
                            )}
                          </div>
                          <div className="font-mono text-[10.5px] text-muted break-all mt-0.5">
                            {r.pattern}
                          </div>
                          {r.hint && (
                            <div className={cn(hint, "mt-0.5")}>{r.hint}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="flex gap-1.5">
                <Input
                  value={pattern}
                  placeholder="type a pattern to probe this bill"
                  onChange={(e) => setPattern(e.target.value)}
                />
                <Input
                  value={flags}
                  placeholder="i"
                  className="w-12! flex-none"
                  onChange={(e) => setFlags(e.target.value)}
                />
              </div>
              <div className="mt-2 font-mono text-xs">
                {!pattern.trim() ? (
                  <span className={hint}>
                    The first capture group (or whole match) shows here, with a
                    count.
                  </span>
                ) : result === null ? (
                  <span className="text-accent">Invalid pattern</span>
                ) : result.count === 0 ? (
                  <span className={hint}>No matches in this bill</span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-ink">
                    {result.count} match{result.count === 1 ? "" : "es"} · first
                    <ValueChip value={result.first ?? ""} size="sm" />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
