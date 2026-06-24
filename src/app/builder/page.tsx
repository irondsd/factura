"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button, Input, Select, microLabel } from "@/components/ui";
import { detectScore, runConfig } from "@/parsers/engine/evaluate";
import type { ParsedResult, ParserConfig } from "@/parsers/engine/types";
import { evaluateConfig } from "@/parsers/builder/evaluate";
import type { EvalResult, ValueRec } from "@/parsers/builder/evaluate";
import { generateBody } from "@/parsers/builder/generate";
import type { Body } from "@/parsers/builder/generate";
import { bodyToConfig } from "@/parsers/builder/parse";
import {
  emptyConfig,
  newCapture,
  newCustom,
  newDerive,
  ROLE_KEYS,
  ROLE_LABEL,
} from "@/parsers/builder/model";
import type { BuilderConfig } from "@/parsers/builder/model";
import { normalize } from "@/parsers/normalize";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc";
import {
  CaptureCard,
  CustomCard,
  DeriveCard,
  hint,
  RoleCard,
  ValueChip,
  type ValueOption,
} from "./_cards";

// ── Regex toolkit recipes (left column) ───────────────────────────────────────
type Recipe = { label: string; pattern: string; flags?: string; hint?: string };

const REGEX_RECIPES: { group: string; items: Recipe[] }[] = [
  {
    group: "Amounts",
    items: [
      {
        label: "LatAm · 1.234.567,89",
        pattern: "(?:\\$\\s*)?((?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{2})?)",
        hint: "→ AR number (AR/UY/BR)",
      },
      {
        label: "US / intl · 1,234,567.89",
        pattern: "(?:\\$\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{2})?)",
        hint: "→ US number",
      },
      {
        label: "Whole units · 1.234.567",
        pattern: "\\$?\\s*(\\d{1,3}(?:\\.\\d{3})+)",
        hint: "no decimals (CLP) → AR number",
      },
      {
        label: "After a label · “Total a pagar”",
        pattern: "Total\\s*a\\s*pagar\\s*:?\\s*\\$?\\s*([\\d.,]+)",
        flags: "i",
        hint: "swap the label text for yours",
      },
    ],
  },
  {
    group: "Dates",
    items: [
      { label: "DD/MM/YYYY", pattern: "(\\d{2}/\\d{2}/\\d{4})", hint: "→ date DD/MM/YYYY" },
      { label: "YYYY-MM-DD", pattern: "(\\d{4}-\\d{2}-\\d{2})" },
      { label: "MM/YYYY", pattern: "(\\d{2})[/-](\\d{4})", hint: "month + year" },
      {
        label: "Spanish month name",
        pattern: "(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)",
        flags: "i",
      },
    ],
  },
  {
    group: "Identifiers",
    items: [
      { label: "CUIT · 20-12345678-9", pattern: "(\\d{2}-\\d{8}-\\d)" },
      {
        label: "Account / client no.",
        pattern: "(?:cliente|cuenta|n[°º])\\s*:?\\s*(\\d{4,})",
        flags: "i",
      },
      { label: "Any run of digits", pattern: "(\\d+)" },
    ],
  },
];

function recipeMatch(text: string, r: Recipe): string | undefined {
  if (!text) return undefined;
  try {
    const m = new RegExp(r.pattern, r.flags || undefined).exec(text);
    return m ? (m[1] ?? m[0]) : undefined;
  } catch {
    return undefined;
  }
}

function testerMatches(
  text: string,
  pattern: string,
  flags: string,
): { count: number; first?: string } | null {
  if (!pattern.trim() || !text) return { count: 0 };
  try {
    const g = flags.includes("g") ? flags : `${flags}g`;
    const all = [...text.matchAll(new RegExp(pattern, g))];
    return { count: all.length, first: all[0]?.[1] ?? all[0]?.[0] };
  } catch {
    return null;
  }
}

type Sig = { pattern: string; flags: string };
type Mode = "structured" | "json";

// ── option builders ────────────────────────────────────────────────────────────
function captureOptions(config: BuilderConfig, values: EvalResult["values"]): ValueOption[] {
  const opts: ValueOption[] = [];
  for (const cap of config.captures)
    for (const o of cap.outputs)
      if (o.name) opts.push({ name: o.name, origin: "capture", rec: values[o.name] });
  return opts;
}
function optionsBeforeDerive(config: BuilderConfig, values: EvalResult["values"], idx: number): ValueOption[] {
  const opts = captureOptions(config, values);
  for (let i = 0; i < idx; i++) {
    const d = config.derives[i];
    if (d.name) opts.push({ name: d.name, origin: "derive", rec: values[d.name] });
  }
  return opts;
}
function allOptions(config: BuilderConfig, values: EvalResult["values"]): ValueOption[] {
  return optionsBeforeDerive(config, values, config.derives.length);
}

function moveArr<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const n = arr.slice();
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

// ── highlight ──────────────────────────────────────────────────────────────────
type Span = { start: number; end: number; tone: "strong" | "faint" };

/** Two-tone spans: every captured value faint, the focused one strong. */
function structuredSpans(values: EvalResult["values"], focusKey: string | null): Span[] {
  const faint: { start: number; end: number }[] = [];
  const strong: { start: number; end: number }[] = [];
  for (const name in values) {
    const rec = values[name];
    if (rec.origin !== "capture") continue;
    for (const s of rec.spans) faint.push(s);
  }
  if (focusKey && values[focusKey]) for (const s of values[focusKey].spans) strong.push(s);
  const faintKept = faint.filter((f) => !strong.some((s) => f.start < s.end && s.start < f.end));
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
function bodySpans(text: string, body: Body | undefined): Span[] {
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
                indices?: { [k: number]: [number, number]; groups?: Record<string, [number, number]> };
              })
            | null
        )?.indices;
        if (!indices) continue;
        const gi = typeof out.group === "number" ? indices[out.group] : indices.groups?.[out.group];
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

function HighlightedText({ text, spans }: { text: string; spans: Span[] }) {
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

// ── Page ────────────────────────────────────────────────────────────────────────
function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const billId = params.get("bill");
  const parserSlug = params.get("parser");
  const { showToast } = useApp();
  const utils = trpc.useUtils();

  const billQuery = trpc.bills.get.useQuery({ id: billId! }, { enabled: Boolean(billId) });
  const presets = trpc.parsers.list.useQuery();
  const vendorList = trpc.vendors.list.useQuery();

  const [bills, setBills] = useState<{ name: string; text: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [seeded, setSeeded] = useState(false);

  const [mode, setMode] = useState<Mode>("structured");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [editingOwn, setEditingOwn] = useState(true);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vendorSlug, setVendorSlug] = useState("");
  const [sigs, setSigs] = useState<Sig[]>([{ pattern: "", flags: "i" }]);
  const [noneSigs, setNoneSigs] = useState<Sig[]>([]);
  const [config, setConfig] = useState<BuilderConfig>(() => emptyConfig());
  const [advanced, setAdvanced] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Seed once from the loaded bill / preset. Forward-only: an existing saved
  // parser opens in the JSON tab (the structured editor builds new configs).
  if (!seeded && (billId ? billQuery.data : true) && presets.data) {
    setSeeded(true);
    if (billQuery.data) {
      setBills([{ name: billQuery.data.fileName ?? "bill", text: normalize(billQuery.data.rawText) }]);
    }
    const preset =
      (parserSlug && presets.data.find((p) => p.slug === parserSlug)) ||
      (billQuery.data?.parserKey && presets.data.find((p) => p.slug === billQuery.data!.parserKey));
    if (preset) {
      if (preset.editable) setExistingId(preset.id);
      else setEditingOwn(false);
      setLoadedSlug(preset.slug);
      setSlug(preset.slug);
      setDisplayName(preset.displayName);
      setVendorSlug(preset.vendorSlug);
      const { slug: _s, vendor: _v, version: _vn, ...bodyRest } = preset.body as Record<string, unknown>;
      void _s;
      void _v;
      void _vn;
      const body = bodyRest as Body;
      setSigs(
        body.detect?.allOf?.length
          ? body.detect.allOf.map((s) => ({ pattern: s.pattern, flags: s.flags ?? "" }))
          : [{ pattern: "", flags: "i" }],
      );
      setNoneSigs((body.detect?.noneOf ?? []).map((s) => ({ pattern: s.pattern, flags: s.flags ?? "" })));
      const { detect: _omit, ...rest } = body;
      void _omit;
      // Open in the structured editor when the body reverse-maps; otherwise
      // (region, exotic compute, un-mappable validations) fall back to JSON.
      const asConfig = bodyToConfig(body);
      if (asConfig) {
        setConfig(asConfig);
        setMode("structured");
      } else {
        setAdvanced(JSON.stringify(rest, null, 2));
        setMode("json");
      }
    } else {
      const orphan = parserSlug || billQuery.data?.parserKey;
      if (orphan) {
        setLoadedSlug(orphan);
        setSlug(orphan);
        setVendorSlug(orphan);
        setDisplayName(orphan);
      }
    }
  }

  const activeText = bills[activeIdx]?.text ?? "";
  const knownVendor = (vendorList.data ?? []).some((v) => v.slug === vendorSlug);

  const detectObj = useMemo(
    () => ({
      allOf: sigs.filter((s) => s.pattern.trim()),
      noneOf: noneSigs.filter((s) => s.pattern.trim()),
    }),
    [sigs, noneSigs],
  );

  // Assembled engine body (drives finish + JSON-mode preview/highlight).
  const assembled = useMemo((): { body?: Body; error?: string } => {
    if (mode === "structured") {
      return { body: generateBody(config, { allOf: sigs, noneOf: noneSigs }) };
    }
    if (!advanced.trim()) return { error: "Add a definition" };
    try {
      const parsed = JSON.parse(advanced) as Record<string, unknown>;
      return { body: { ...(parsed as object), detect: detectObj } as Body };
    } catch (e) {
      return { error: `Invalid JSON: ${e instanceof Error ? e.message : e}` };
    }
  }, [mode, config, sigs, noneSigs, advanced, detectObj]);

  // Structured mode: rich per-value evaluation for chips / highlight / preview.
  const structResult = useMemo(
    () => (mode === "structured" && activeText ? evaluateConfig(activeText, config) : null),
    [mode, activeText, config],
  );

  // JSON mode: final result via the real engine.
  const jsonPreview = useMemo(() => {
    if (mode !== "json" || !assembled.body || !activeText) return null;
    const full: ParserConfig = {
      slug: slug || "draft",
      version: 1,
      vendor: { slug: vendorSlug || slug || "draft", displayName: displayName || "Draft" },
      ...assembled.body,
    };
    try {
      return { result: runConfig(full, activeText), error: null as string | null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, assembled.body, activeText, slug, vendorSlug, displayName]);

  const spans = useMemo(() => {
    if (!activeText) return [];
    return mode === "structured"
      ? structuredSpans(structResult?.values ?? {}, focusKey)
      : bodySpans(activeText, assembled.body);
  }, [mode, structResult, focusKey, activeText, assembled.body]);

  const values = structResult?.values ?? {};
  const recOf = (name: string): ValueRec | undefined => values[name];
  const onPreview = (name: string | null) => setFocusKey(name);

  const setCaptures = (captures: BuilderConfig["captures"]) => setConfig((c) => ({ ...c, captures }));
  const setDerives = (derives: BuilderConfig["derives"]) => setConfig((c) => ({ ...c, derives }));
  const setCustom = (custom: BuilderConfig["custom"]) => setConfig((c) => ({ ...c, custom }));

  const hasSignature = detectObj.allOf.length > 0;
  const matchesCurrent =
    hasSignature &&
    activeText.length > 0 &&
    detectScore({ detect: detectObj } as ParserConfig, activeText) !== null;

  const collisions = trpc.parsers.detectCollisions.useQuery(
    { detect: detectObj, excludeSlug: loadedSlug ?? undefined },
    { enabled: hasSignature },
  );
  const collisionList = collisions.data ?? [];
  const gatePassed = matchesCurrent && collisionList.length === 0;

  const usage = trpc.parsers.usage.useQuery({ slug }, { enabled: Boolean(slug) });
  const samples = trpc.parsers.listSamples.useQuery({ slug }, { enabled: Boolean(slug) });

  const toJson = () => {
    // Body for the JSON editor mirrors what we'd save, minus the separately-
    // edited detect block (step 1 owns that in both modes).
    const { detect: _d, ...rest } = generateBody(config, { allOf: [], noneOf: [] });
    void _d;
    setAdvanced(JSON.stringify(rest, null, 2));
    setMode("json");
  };
  const toStructured = () => setMode("structured");

  const createParser = trpc.parsers.create.useMutation();
  const updateParser = trpc.parsers.update.useMutation();
  const addSample = trpc.parsers.addSample.useMutation();
  const reparse = trpc.bills.reparse.useMutation();

  const dropFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;
      try {
        const { default: pdfToText } = await import("react-pdftotext");
        const raw = await pdfToText(file);
        if (raw.trim().length < 20) {
          showToast(`✕ ${file.name}: no text found`);
          continue;
        }
        setBills((b) => {
          const next = [...b, { name: file.name, text: normalize(raw) }];
          setActiveIdx(next.length - 1);
          return next;
        });
      } catch {
        showToast(`✕ ${file.name}: could not read`);
      }
    }
  };

  const slugValid = /^[a-z0-9-]+$/.test(slug);
  const previewOk =
    mode === "structured" ? Boolean(structResult?.resolved) : jsonPreview?.result != null;
  const canFinish =
    gatePassed &&
    slugValid &&
    displayName.trim().length > 0 &&
    Boolean(assembled.body) &&
    !assembled.error &&
    previewOk;

  const finish = async () => {
    if (!assembled.body) return;
    const input = { slug, displayName, vendorSlug: vendorSlug || slug, definition: assembled.body };
    try {
      let id = existingId;
      if (!id) {
        const list = await utils.parsers.list.fetch();
        id = list.find((p) => p.slug === slug && p.editable)?.id ?? null;
      }
      if (id) {
        await updateParser.mutateAsync({ ...input, id });
      } else {
        const created = await createParser.mutateAsync(input);
        setExistingId(created.id);
        setEditingOwn(true);
      }
      const res = await reparse.mutateAsync();
      showToast(`Parser saved · reparsed ${res.updated} bill(s)`);
      utils.invalidate();
      router.push("/bills");
    } catch (e) {
      showToast(`✕ Save failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="mx-auto max-w-[84rem] px-5 pt-7 pb-20">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Parser builder {existingId ? "· editing" : "· new"}</Eyebrow>
          <Display size={30} className="block mt-1.5">
            {displayName || "Untitled parser"}
          </Display>
        </div>
        <Button variant="ghost" onClick={() => router.push("/bills")}>
          ← Back to bills
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 mt-[22px] items-start">
        {/* ── Left: bill text ── */}
        <div className="md:sticky md:top-4">
          <div className="flex items-center justify-between mb-2">
            <Label>Bill text</Label>
            {mode === "structured" && (
              <span className="font-mono text-[10.5px] text-muted">focus a value to highlight its span →</span>
            )}
          </div>
          {bills.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {bills.map((b, i) => (
                <button key={i} onClick={() => setActiveIdx(i)} className={tabClass(i === activeIdx)} title={b.name}>
                  {b.name.length > 18 ? `${b.name.slice(0, 16)}…` : b.name}
                </button>
              ))}
            </div>
          )}
          <pre className="ruled font-mono text-xs leading-[1.55] whitespace-pre-wrap break-words bg-paper border border-line py-2.5 px-3 h-[62vh] overflow-y-auto m-0 text-ink">
            {activeText ? <HighlightedText text={activeText} spans={spans} /> : "Drop a PDF to start."}
          </pre>
          <DropZone onFiles={dropFiles} />
          <RegexToolkit
            text={activeText}
            onCopy={(p) => {
              navigator.clipboard?.writeText(p);
              showToast("Pattern copied — paste into a regex box");
            }}
          />
          {slug && (
            <div className="mt-3">
              <Label>Saved samples ({samples.data?.length ?? 0})</Label>
              <div className="flex flex-wrap gap-1.5">
                {(samples.data ?? []).map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      setBills((b) => {
                        const next = [...b, { name: s.fileName ?? "sample", text: normalize(s.rawText) }];
                        setActiveIdx(next.length - 1);
                        return next;
                      })
                    }
                    className={tabClass(false)}
                  >
                    {s.fileName ?? "sample"} ↺
                  </button>
                ))}
                {activeText && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={addSample.isPending}
                    onClick={async () => {
                      await addSample.mutateAsync({ slug, fileName: bills[activeIdx]?.name, rawText: activeText });
                      samples.refetch();
                      showToast("Saved as regression sample");
                    }}
                  >
                    + Save this bill as sample
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: editor ── */}
        <div className="flex flex-col gap-5">
          <Section title="Parser">
            <Grid>
              <Field label="Name">
                <Input value={displayName} placeholder="e.g. Aguas Andinas" onChange={(e) => setDisplayName(e.target.value)} />
              </Field>
              <Field label="Slug (id)">
                <Input
                  value={slug}
                  placeholder="aguas-andinas"
                  onChange={(e) => setSlug(e.target.value)}
                  className={cn(slug && !slugValid && "border-accent")}
                />
              </Field>
              <Field label="Vendor (charts group by this)">
                <Select
                  value={knownVendor ? vendorSlug : "__new__"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setVendorSlug(val === "__new__" ? "" : val);
                  }}
                >
                  {(vendorList.data ?? []).map((v) => (
                    <option key={v.id} value={v.slug}>
                      {v.displayName}
                    </option>
                  ))}
                  <option value="__new__">➕ New vendor…</option>
                </Select>
              </Field>
              {!knownVendor && (
                <Field label="New vendor slug">
                  <Input value={vendorSlug} placeholder={slug || "vendor"} onChange={(e) => setVendorSlug(e.target.value)} />
                </Field>
              )}
            </Grid>
          </Section>

          {/* step 1 — detection */}
          <Section title="1 · Recognize the bill">
            <p className={cn(hint, "mb-2.5")}>
              Patterns that uniquely identify this vendor. All must appear in the text, and they must not match any of your
              other bills.
            </p>
            {sigs.map((s, i) => (
              <SigRow
                key={i}
                sig={s}
                onChange={(ns) => setSigs(sigs.map((x, j) => (j === i ? ns : x)))}
                onRemove={sigs.length > 1 ? () => setSigs(sigs.filter((_, j) => j !== i)) : undefined}
              />
            ))}
            <Button size="sm" variant="outline" onClick={() => setSigs([...sigs, { pattern: "", flags: "i" }])}>
              + Add signature
            </Button>
            <div className="mt-4">
              <p className={cn(hint, "mb-2.5")}>
                Optional — patterns that must <em>not</em> appear. Splits one vendor across two parsers.
              </p>
              {noneSigs.map((s, i) => (
                <SigRow
                  key={i}
                  sig={s}
                  onChange={(ns) => setNoneSigs(noneSigs.map((x, j) => (j === i ? ns : x)))}
                  onRemove={() => setNoneSigs(noneSigs.filter((_, j) => j !== i))}
                />
              ))}
              <Button size="sm" variant="outline" onClick={() => setNoneSigs([...noneSigs, { pattern: "", flags: "i" }])}>
                + Add exclusion
              </Button>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <StatusLine ok={matchesCurrent} text={matchesCurrent ? "Matches this bill" : "Does not match this bill yet"} />
              <StatusLine
                ok={collisionList.length === 0}
                text={
                  collisionList.length === 0
                    ? "No conflicts with your other bills"
                    : `Conflicts with ${collisionList.length} other bill(s) — narrow the signature`
                }
              />
            </div>
          </Section>

          {/* step 2 — extraction */}
          <Section
            title="2 · Extract the data"
            dim={!gatePassed}
            right={
              gatePassed ? (
                <div className="flex gap-1.5">
                  <ModeTab active={mode === "structured"} onClick={toStructured}>
                    Structured
                  </ModeTab>
                  <ModeTab active={mode === "json"} onClick={toJson}>
                    Advanced (JSON)
                  </ModeTab>
                </div>
              ) : undefined
            }
          >
            {!gatePassed ? (
              <p className={cn(hint, "mb-2.5")}>Finish step 1 to unlock extraction.</p>
            ) : mode === "json" ? (
              <>
                <p className={cn(hint, "mb-2")}>
                  The underlying engine body — captures, compute, roles, custom. Edits preview live below.
                </p>
                <textarea
                  value={advanced}
                  onChange={(e) => setAdvanced(e.target.value)}
                  spellCheck={false}
                  className={cn(
                    "w-full box-border min-h-[340px] font-mono text-[11.5px] leading-relaxed bg-paper border py-2.5 px-3 resize-y text-ink outline-none",
                    assembled.error ? "border-accent" : "border-line",
                  )}
                />
                {assembled.error && <p className={cn(hint, "text-accent mt-1.5")}>△ {assembled.error}</p>}
              </>
            ) : (
              <>
                <SubHead label="Extract — capture from the bill" sub="Each card is one regex producing one or more named values." />
                {config.captures.length === 0 && (
                  <p className={cn(hint, "mb-2.5")}>Nothing captured yet. Add a capture to read a value off the bill.</p>
                )}
                {config.captures.map((cap, i) => (
                  <CaptureCard
                    key={cap.id}
                    cap={cap}
                    recOf={recOf}
                    onPreview={onPreview}
                    onChange={(nc) => setCaptures(config.captures.map((x, j) => (j === i ? nc : x)))}
                    onRemove={() => setCaptures(config.captures.filter((_, j) => j !== i))}
                  />
                ))}
                <Button size="sm" variant="outline" onClick={() => setCaptures([...config.captures, newCapture()])}>
                  + add capture
                </Button>

                <div className="h-4" />
                <SubHead
                  label="Derive — compute from other values"
                  sub="Each card makes a new value from the values above it. Order matters; ≈ marks a computed value."
                />
                {config.derives.map((d, i) => (
                  <DeriveCard
                    key={d.id}
                    der={d}
                    recOf={recOf}
                    options={optionsBeforeDerive(config, values, i)}
                    onPreview={onPreview}
                    focusKey={focusKey}
                    onChange={(nd) => setDerives(config.derives.map((x, j) => (j === i ? nd : x)))}
                    onRemove={() => setDerives(config.derives.filter((_, j) => j !== i))}
                    moveUp={() => setDerives(moveArr(config.derives, i, -1))}
                    moveDown={() => setDerives(moveArr(config.derives, i, 1))}
                  />
                ))}
                <Button size="sm" variant="outline" onClick={() => setDerives([...config.derives, newDerive()])}>
                  + add derived value
                </Button>

                <div className="h-4" />
                <SubHead label="Roles — the four required slots" sub="Point each slot at a value. Add fallbacks for bills that print it differently." />
                {ROLE_KEYS.map((key) => (
                  <RoleCard
                    key={key}
                    label={ROLE_LABEL[key]}
                    role={config.roles[key]}
                    resolved={structResult?.roleOut[key]}
                    options={allOptions(config, values)}
                    onPreview={onPreview}
                    focusKey={focusKey}
                    onChange={(r) => setConfig((c) => ({ ...c, roles: { ...c.roles, [key]: r } }))}
                  />
                ))}

                <div className="h-4" />
                <SubHead label="Custom fields" sub="Anything else worth tracking — charted later." />
                {config.custom.map((cf, i) => (
                  <CustomCard
                    key={cf.id}
                    field={cf}
                    recOf={recOf}
                    options={allOptions(config, values)}
                    onPreview={onPreview}
                    focusKey={focusKey}
                    onChange={(nf) => setCustom(config.custom.map((x, j) => (j === i ? nf : x)))}
                    onRemove={() => setCustom(config.custom.filter((_, j) => j !== i))}
                  />
                ))}
                <Button size="sm" variant="outline" onClick={() => setCustom([...config.custom, newCustom()])}>
                  + add custom field
                </Button>
              </>
            )}

            {/* preview / review */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Label>{mode === "structured" && structResult?.issues.length ? "Needs review" : "Preview"}</Label>
                {previewOk && <ValueChip value="resolves" size="sm" />}
              </div>
              {mode === "structured" ? (
                structResult ? (
                  structResult.issues.length ? (
                    <ReviewBox issues={structResult.issues} />
                  ) : (
                    <StructuredPreview result={structResult} />
                  )
                ) : (
                  <p className={cn(hint, "mb-2.5")}>Define fields to see the result.</p>
                )
              ) : assembled.error ? (
                <ErrorBox text={assembled.error} />
              ) : jsonPreview?.error ? (
                <ErrorBox text={jsonPreview.error} />
              ) : jsonPreview?.result ? (
                <ParsedPreview result={jsonPreview.result} />
              ) : (
                <p className={cn(hint, "mb-2.5")}>Define fields to see the result.</p>
              )}
            </div>
          </Section>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="solid"
              size="lg"
              disabled={!canFinish || createParser.isPending || updateParser.isPending || reparse.isPending}
              onClick={finish}
            >
              {!editingOwn ? "Fork & save" : existingId ? "Save & reparse" : "Finish"}
            </Button>
            {slug && usage.data && usage.data.count > 0 && (
              <span className={hint}>Saving re-runs this parser against {usage.data.count} existing bill(s).</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── small components ──────────────────────────────────────────────────────────
function SubHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="my-1 mb-2.5">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">{label}</div>
      {sub && <p className={cn(hint, "mt-0.5")}>{sub}</p>}
    </div>
  );
}

function StructuredPreview({ result }: { result: EvalResult }) {
  const rows: [string, string][] = [
    ["Account / ID", fmt(result.roleOut.identity.value)],
    ["Amount", fmt(result.roleOut.amount.value)],
    ["Period", fmt(result.roleOut.period.value)],
    ["Due date", fmt(result.roleOut.dueDate.value)],
    ...result.custom.map(
      (c): [string, string] => [
        `${c.name}${c.type === "quantity" && c.unit ? ` (${c.unit})` : ""}`,
        c.value === undefined ? "—" : `${c.value}${c.type === "quantity" && c.unit ? ` ${c.unit}` : ""}`,
      ],
    ),
  ];
  return <RowBox rows={rows} />;
}

function ParsedPreview({ result }: { result: ParsedResult }) {
  const rows: [string, string][] = [
    ["Account / ID", result.identity],
    ["Amount", String(result.amount)],
    ["Period", result.period],
    ["Due date", result.dueDate],
    ...Object.entries(result.custom).map(
      ([k, v]): [string, string] => [k, typeof v === "object" ? `${v.value}${v.unit ? ` ${v.unit}` : ""}` : String(v)],
    ),
  ];
  return <RowBox rows={rows} />;
}

function RowBox({ rows }: { rows: [string, string][] }) {
  return (
    <div className="border border-line bg-paper">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={cn(
            "flex justify-between gap-3 py-[7px] px-3 font-mono text-xs",
            i === 0 ? "" : "border-t border-dashed border-line",
          )}
        >
          <span className="text-muted">{k}</span>
          <span className="text-ink font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

function fmt(v: unknown): string {
  return v === undefined || v === null || v === "" ? "—" : String(v);
}

function ReviewBox({ issues }: { issues: EvalResult["issues"] }) {
  return (
    <div className="border border-accent bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
      {issues.map((it, i) => (
        <div
          key={i}
          className={cn("py-2 px-3 font-mono text-xs text-ink", i === 0 ? "" : "border-t border-dashed border-accent")}
        >
          <span className="text-accent">{it.type === "error" ? "✕" : "△"}</span>{" "}
          <span className="font-medium">{it.label}</span>
          {it.detail && <span className="text-muted"> — {it.detail}</span>}
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="border border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] py-2.5 px-3 font-mono text-xs">
      {text}
    </div>
  );
}

function StatusLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono text-xs", ok ? "text-ink" : "text-muted")}>
      <span className={cn("w-2 h-2 inline-block flex-none", ok ? "bg-accent" : "bg-line")} />
      {text}
    </span>
  );
}

function SigRow({ sig, onChange, onRemove }: { sig: Sig; onChange: (s: Sig) => void; onRemove?: () => void }) {
  return (
    <div className="flex gap-1.5 mb-1.5">
      <Input value={sig.pattern} placeholder="e.g. AGUAS ANDINAS" onChange={(e) => onChange({ ...sig, pattern: e.target.value })} />
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

function DropZone({ onFiles }: { onFiles: (f: FileList) => void }) {
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

function RegexToolkit({ text, onCopy }: { text: string; onCopy: (pattern: string) => void }) {
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
            <button onClick={() => setTab("recipes")} className={tabClass(tab === "recipes")}>
              Recipes
            </button>
            <button onClick={() => setTab("tester")} className={tabClass(tab === "tester")}>
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
                            <span className="font-mono text-[11px] text-ink">{r.label}</span>
                            {hitv !== undefined ? (
                              <ValueChip value={hitv.length > 16 ? `${hitv.slice(0, 15)}…` : hitv} size="sm" />
                            ) : (
                              <span className={hint}>no match</span>
                            )}
                          </div>
                          <div className="font-mono text-[10.5px] text-muted break-all mt-0.5">{r.pattern}</div>
                          {r.hint && <div className={cn(hint, "mt-0.5")}>{r.hint}</div>}
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
                <Input value={pattern} placeholder="type a pattern to probe this bill" onChange={(e) => setPattern(e.target.value)} />
                <Input value={flags} placeholder="i" className="w-12! flex-none" onChange={(e) => setFlags(e.target.value)} />
              </div>
              <div className="mt-2 font-mono text-xs">
                {!pattern.trim() ? (
                  <span className={hint}>The first capture group (or whole match) shows here, with a count.</span>
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

function Section({
  title,
  children,
  dim,
  right,
}: {
  title: string;
  children: React.ReactNode;
  dim?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <section
      className={cn("border border-line p-4 transition-opacity duration-200", dim ? "opacity-55 pointer-events-none" : "opacity-100")}
    >
      <div className="flex items-baseline justify-between gap-2.5 mb-3">
        <h3 className="font-mono text-micro uppercase tracking-label text-accent">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className={microLabel}>{label}</span>
      {children}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className={cn(microLabel, "mb-1.5")}>{children}</p>;
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={tabClass(active)}>
      {children}
    </button>
  );
}

function tabClass(active: boolean): string {
  return cn(
    "font-mono text-micro uppercase tracking-[0.1em] py-[5px] px-2.5 cursor-pointer border transition-colors",
    active ? "border-ink bg-ink text-paper" : "border-line bg-transparent text-muted",
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}
