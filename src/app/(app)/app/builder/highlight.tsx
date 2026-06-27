// Highlighting the bill text. Structured mode paints every captured value
// faint and the focused one strong; JSON mode highlights each capture's group.

import type { EvalResult } from "@/parsers/builder/evaluate";
import type { Body } from "@/parsers/builder/generate";
import { cn } from "@/lib/cn";

export type Span = { start: number; end: number; tone: "strong" | "faint" };

/** Two-tone spans: every captured value faint, the focused one strong. */
export function structuredSpans(
  values: EvalResult["values"],
  focusKey: string | null,
): Span[] {
  const faint: { start: number; end: number }[] = [];
  const strong: { start: number; end: number }[] = [];
  for (const name in values) {
    const rec = values[name];
    if (rec.origin !== "capture") continue;
    for (const s of rec.spans) faint.push(s);
  }
  if (focusKey && values[focusKey])
    for (const s of values[focusKey].spans) strong.push(s);
  const faintKept = faint.filter(
    (f) => !strong.some((s) => f.start < s.end && s.start < f.end),
  );
  const all: Span[] = [
    ...strong.map((s) => ({ ...s, tone: "strong" as const })),
    ...faintKept.map((s) => ({ ...s, tone: "faint" as const })),
  ].sort((a, b) => a.start - b.start || (a.tone === "strong" ? -1 : 1));
  const out: Span[] = [];
  let last = -1;
  for (const s of all)
    if (s.start >= last) {
      out.push(s);
      last = s.end;
    }
  return out;
}

/** Single-tone spans for JSON mode: highlight each capture's focused group. */
export function bodySpans(text: string, body: Body | undefined): Span[] {
  if (!body) return [];
  const spans: Span[] = [];
  for (const cap of body.captures ?? []) {
    for (const out of Object.values(cap.outputs)) {
      try {
        const re = new RegExp(cap.pattern, `${cap.flags ?? ""}d`);
        const m = re.exec(text);
        const indices = (
          m as
            | (RegExpExecArray & {
                indices?: {
                  [k: number]: [number, number];
                  groups?: Record<string, [number, number]>;
                };
              })
            | null
        )?.indices;
        if (!indices) continue;
        const gi =
          typeof out.group === "number"
            ? indices[out.group]
            : indices.groups?.[out.group];
        if (gi) spans.push({ start: gi[0], end: gi[1], tone: "strong" });
      } catch {
        // invalid regex while typing
      }
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let last = -1;
  for (const s of spans)
    if (s.start >= last) {
      out.push(s);
      last = s.end;
    }
  return out;
}

export function HighlightedText({
  text,
  spans,
}: {
  text: string;
  spans: Span[];
}) {
  if (!spans.length) return <>{text}</>;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) nodes.push(text.slice(cursor, s.start));
    nodes.push(
      <mark
        key={i}
        className={cn(
          "text-ink px-px",
          s.tone === "strong"
            ? "bg-[color-mix(in_srgb,var(--accent)_32%,transparent)] outline outline-1 outline-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--accent)_13%,transparent)]",
        )}
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
