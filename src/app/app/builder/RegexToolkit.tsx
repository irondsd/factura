"use client";

// The collapsible regex helper under the bill text: a library of copy-ready
// recipes (live-matched against the current bill) and a free-form tester.

import { useState } from "react";
import { Input, hint, microLabel, tabClass } from "@/components/ui";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
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
  const { t } = useI18n();
  const tk = t.builder.toolkit;
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
        <span>{tk.title}</span>
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <button
              onClick={() => setTab("recipes")}
              className={tabClass(tab === "recipes")}
            >
              {tk.recipes}
            </button>
            <button
              onClick={() => setTab("tester")}
              className={tabClass(tab === "tester")}
            >
              {tk.tester}
            </button>
          </div>
          {tab === "recipes" ? (
            <div className="flex flex-col gap-3">
              {REGEX_RECIPES.map((sec) => (
                <div key={sec.groupId}>
                  <span className={microLabel}>
                    {tk.groups[sec.groupId as keyof typeof tk.groups]}
                  </span>
                  <div className="flex flex-col gap-1 mt-1">
                    {sec.items.map((r) => {
                      const hitv = recipeMatch(text, r);
                      const item = tk.items[r.id as keyof typeof tk.items];
                      return (
                        <button
                          key={r.id}
                          onClick={() => onCopy(r.pattern)}
                          title={tk.copyPattern}
                          className="text-left border border-line hover:border-ink transition-colors py-1.5 px-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-ink">
                              {item.label}
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
                              <span className={hint}>{tk.noMatch}</span>
                            )}
                          </div>
                          <div className="font-mono text-[10.5px] text-muted break-all mt-0.5">
                            {r.pattern}
                          </div>
                          {item.hint && (
                            <div className={cn(hint, "mt-0.5")}>{item.hint}</div>
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
                  placeholder={tk.testerPlaceholder}
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
                  <span className={hint}>{tk.testerHelp}</span>
                ) : result === null ? (
                  <span className="text-accent">{tk.invalid}</span>
                ) : result.count === 0 ? (
                  <span className={hint}>{tk.noMatches}</span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-ink">
                    {interpolate(
                      result.count === 1 ? tk.matchOne : tk.matchOther,
                      { count: result.count },
                    )}
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
