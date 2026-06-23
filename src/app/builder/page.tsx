"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Badge, Button, Input, Select } from "@/components/ui";
import { detectScore, runConfig } from "@/parsers/engine/evaluate";
import { applyTransforms } from "@/parsers/engine/transforms";
import { addMonths as addMonthsClient } from "@/parsers/helpers";
import type {
  ParsedResult,
  ParserConfig,
  TransformOp,
} from "@/parsers/engine/types";
import { normalize } from "@/parsers/normalize";
import { cn } from "@/lib/cn";
import { trpc } from "@/lib/trpc";

const CATEGORIES = [
  "electricity",
  "gas",
  "water",
  "expensas",
  "internet",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

const ROLES = ["identity", "amount", "period", "dueDate"] as const;
type Role = (typeof ROLES)[number];
const ROLE_LABEL: Record<Role, string> = {
  identity: "Account / unique ID",
  amount: "Amount",
  period: "Period",
  dueDate: "Due date",
};

const TRANSFORMS: { label: string; value: string }[] = [
  { label: "AR number (1.234,56)", value: "numberAR" },
  { label: "US number (1,234.56)", value: "numberUS" },
  { label: "cents ÷ 100", value: "centsToAmount" },
  { label: "strip leading zeros", value: "stripLeadingZeros" },
  { label: "to integer", value: "toInt" },
  { label: "month of date", value: "monthOf" },
  { label: "month-year → period (2025-09-01)", value: "monthYear" },
  { label: "lowercase", value: "lowercase" },
  { label: "date DD/MM/YYYY", value: "parseDate:DMY" },
  { label: "date YYMMDD", value: "parseDate:YYMMDD" },
];

function toTransformOp(v: string): TransformOp {
  if (v === "parseDate:DMY") return { parseDate: "DMY" };
  if (v === "parseDate:YYMMDD") return { parseDate: "YYMMDD" };
  return v as TransformOp;
}

type Sig = { pattern: string; flags: string };
type PeriodMode = "date" | "parts";
type FieldRow = {
  id: string;
  role: Role | "custom";
  name: string; // custom only
  type: "money" | "number" | "date" | "string" | "quantity";
  unit: string;
  includeWhen: string;
  pattern: string;
  flags: string;
  group: string;
  transforms: string[];
  // ── period role only ──
  // "date": `pattern` captures a whole date (transforms pick the format).
  // "parts": `pattern` captures the month, `year*` the year; combined via
  // dateFromParts. `monthShift` shifts the result ±N months (addMonths).
  periodMode: PeriodMode;
  monthIsName: boolean;
  yearPattern: string;
  yearFlags: string;
  yearGroup: string;
  monthShift: number;
};

function emptyField(role: FieldRow["role"]): FieldRow {
  return {
    id: crypto.randomUUID(),
    role,
    name: role === "custom" ? "" : role,
    type: "money",
    unit: "",
    includeWhen: "",
    pattern: "",
    flags: "i",
    group: "1",
    transforms: [],
    periodMode: "date",
    monthIsName: false,
    yearPattern: "",
    yearFlags: "i",
    yearGroup: "1",
    monthShift: 0,
  };
}

function fieldKey(f: FieldRow): string {
  return f.role === "custom" ? `f_${f.name || "field"}` : f.role;
}

/** A regex group spec is a number ("1") or a named group. */
function groupOf(s: string): number | string {
  return /^\d+$/.test(s.trim()) ? Number(s.trim()) : s.trim();
}

/** Month names → number, 3-letter-keyed (Spanish + English), lowercased. The
 * period builder feeds this to the engine's `lookup` transform. */
const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};

/** True once the row has the regex(es) it needs to extract anything. */
function fieldIncomplete(f: FieldRow): boolean {
  if (f.role === "period" && f.periodMode === "parts")
    return !f.pattern.trim() || !f.yearPattern.trim();
  return !f.pattern.trim();
}

/** The capture(s) a row contributes — drives live highlighting. */
function fieldCaptureItems(
  f: FieldRow,
): { key: string; pattern: string; flags?: string; group: number | string }[] {
  if (f.role === "period" && f.periodMode === "parts") {
    const out: {
      key: string;
      pattern: string;
      flags?: string;
      group: number | string;
    }[] = [];
    if (f.pattern.trim())
      out.push({
        key: "p_month",
        pattern: f.pattern,
        flags: f.flags,
        group: groupOf(f.group),
      });
    if (f.yearPattern.trim())
      out.push({
        key: "p_year",
        pattern: f.yearPattern,
        flags: f.yearFlags,
        group: groupOf(f.yearGroup),
      });
    return out;
  }
  if (!f.pattern.trim()) return [];
  const key = f.role === "period" ? "p_date" : fieldKey(f);
  return [{ key, pattern: f.pattern, flags: f.flags, group: groupOf(f.group) }];
}

/** Run one field's regex + transforms against text, independent of whether the
 * whole config is complete — drives the per-field live value while typing. */
function extractFieldValue(text: string, f: FieldRow): string | undefined {
  if (!f.pattern.trim() || !text) return undefined;
  try {
    const m = new RegExp(f.pattern, f.flags || undefined).exec(text);
    if (!m) return undefined;
    const g = groupOf(f.group);
    const raw = typeof g === "number" ? m[g] : m.groups?.[g];
    if (raw === undefined) return undefined;
    const v = applyTransforms(raw, f.transforms.map(toTransformOp));
    return v === undefined ? undefined : String(v);
  } catch {
    return undefined;
  }
}

function matchGroup(
  text: string,
  pattern: string,
  flags: string,
  group: string,
): string | undefined {
  if (!pattern.trim() || !text) return undefined;
  const m = new RegExp(pattern, flags || undefined).exec(text);
  if (!m) return undefined;
  const g = groupOf(group);
  return typeof g === "number" ? m[g] : m.groups?.[g];
}

/** Live value for the period row, mirroring generatePeriod's engine output. */
function extractPeriodValue(text: string, f: FieldRow): string | undefined {
  try {
    if (f.periodMode === "parts") {
      const mRaw = matchGroup(text, f.pattern, f.flags, f.group);
      const yRaw = matchGroup(text, f.yearPattern, f.yearFlags, f.yearGroup);
      if (mRaw === undefined || yRaw === undefined) return undefined;
      const month = f.monthIsName
        ? MONTH_LOOKUP[mRaw.slice(0, 3).toLowerCase()]
        : parseInt(mRaw, 10);
      const year = parseInt(yRaw, 10);
      if (!month || Number.isNaN(year)) return undefined;
      const iso = `${year}-${String(month).padStart(2, "0")}-01`;
      return f.monthShift ? addMonthsClient(iso, f.monthShift) : iso;
    }
    const v = extractFieldValue(text, f);
    if (v === undefined) return undefined;
    return f.monthShift ? addMonthsClient(v, f.monthShift) : v;
  } catch {
    return undefined;
  }
}

type Body = Omit<ParserConfig, "slug" | "version" | "vendor">;
type Compute = NonNullable<Body["compute"]>;

/** Emit the captures + compute steps for the period role from its structured
 * editor state. "date" mode optionally shifts a captured date; "parts" mode
 * builds a date from a month (number or name) and a year, then optionally
 * shifts. addMonths snaps to the 1st and rolls the year, so shifts are safe
 * across December/January. */
function generatePeriod(f: FieldRow): {
  captures: Body["captures"];
  compute: Compute;
  rule: { sources: string[] };
} {
  const captures: Body["captures"] = [];
  const compute: Compute = [];

  if (f.periodMode === "parts") {
    captures.push({
      pattern: f.pattern,
      flags: f.flags || undefined,
      outputs: {
        p_month: {
          group: groupOf(f.group),
          transform: f.monthIsName
            ? ["lowercase", { slice: 3 }, { lookup: MONTH_LOOKUP }]
            : ["toInt"],
        },
      },
    });
    captures.push({
      pattern: f.yearPattern,
      flags: f.yearFlags || undefined,
      outputs: {
        p_year: { group: groupOf(f.yearGroup), transform: ["toInt"] },
      },
    });
    if (f.monthShift) {
      compute.push({
        name: "p_parts",
        dateFromParts: { year: "p_year", month: "p_month", day: 1 },
      });
      compute.push({
        name: "period",
        addMonths: { date: "p_parts", delta: f.monthShift },
      });
    } else {
      compute.push({
        name: "period",
        dateFromParts: { year: "p_year", month: "p_month", day: 1 },
      });
    }
    return { captures, compute, rule: { sources: ["period"] } };
  }

  // date mode
  captures.push({
    pattern: f.pattern,
    flags: f.flags || undefined,
    outputs: {
      p_date: {
        group: groupOf(f.group),
        transform: f.transforms.length
          ? f.transforms.map(toTransformOp)
          : undefined,
      },
    },
  });
  if (f.monthShift) {
    compute.push({
      name: "period",
      addMonths: { date: "p_date", delta: f.monthShift },
    });
    return { captures, compute, rule: { sources: ["period"] } };
  }
  return { captures, compute, rule: { sources: ["p_date"] } };
}

/** Assemble the engine body from the structured Fields editor. `incomplete`
 * (vs `error`) means the user simply hasn't filled everything in yet — not a
 * failure to surface as a red error. */
function assembleSimple(
  sigs: Sig[],
  noneSigs: Sig[],
  fields: FieldRow[],
): { body?: Body; error?: string; incomplete?: boolean } {
  const captures: Body["captures"] = [];
  const roles = {} as Body["roles"];
  const custom: NonNullable<Body["custom"]> = [];
  const compute: Compute = [];

  // Empty fields aren't an error — just not done yet.
  if (fields.some(fieldIncomplete)) return { incomplete: true };

  for (const f of fields) {
    if (f.role === "period") {
      const g = generatePeriod(f);
      captures.push(...g.captures);
      compute.push(...g.compute);
      roles.period = g.rule;
      continue;
    }
    const key = fieldKey(f);
    captures.push({
      pattern: f.pattern,
      flags: f.flags || undefined,
      outputs: {
        [key]: {
          group: groupOf(f.group),
          transform: f.transforms.length
            ? f.transforms.map(toTransformOp)
            : undefined,
        },
      },
    });
    if (f.role === "custom") {
      if (!f.name.trim()) return { error: "A custom field is missing a name" };
      custom.push({
        name: f.name,
        source: key,
        type: f.type,
        unit: f.unit || undefined,
        includeWhen: f.includeWhen || undefined,
      });
    } else {
      roles[f.role] = { sources: [key] };
    }
  }

  for (const r of ROLES) {
    if (!roles[r]) return { error: `${ROLE_LABEL[r]} has no field yet` };
  }

  return {
    body: {
      detect: {
        allOf: sigs.filter((s) => s.pattern.trim()),
        noneOf: noneSigs.filter((s) => s.pattern.trim()).length
          ? noneSigs.filter((s) => s.pattern.trim())
          : undefined,
      },
      captures,
      compute: compute.length ? compute : undefined,
      roles,
      custom: custom.length ? custom : undefined,
    },
  };
}

/** Assemble the body from the raw-JSON (advanced) editor + structured detect. */
function assembleAdvanced(
  sigs: Sig[],
  noneSigs: Sig[],
  json: string,
): { body?: Body; error?: string; incomplete?: boolean } {
  if (!json.trim()) return { incomplete: true }; // nothing typed yet
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { error: `Invalid JSON: ${e instanceof Error ? e.message : e}` };
  }
  return {
    body: {
      ...(parsed as object),
      detect: {
        allOf: sigs.filter((s) => s.pattern.trim()),
        noneOf: noneSigs.filter((s) => s.pattern.trim()).length
          ? noneSigs.filter((s) => s.pattern.trim())
          : undefined,
      },
    } as Body,
  };
}

/** Lenient Fields -> body for the Advanced (JSON) view: serialize whatever the
 * user has filled so toggling to JSON never discards partial work. Detect lives
 * separately (structured), so it's not included here. */
function fieldsToBodyDraft(fields: FieldRow[]): Partial<Body> {
  const captures: Body["captures"] = [];
  const roles: Partial<Body["roles"]> = {};
  const custom: NonNullable<Body["custom"]> = [];
  const compute: Compute = [];
  for (const f of fields) {
    if (fieldIncomplete(f)) continue;
    if (f.role === "period") {
      const g = generatePeriod(f);
      captures.push(...g.captures);
      compute.push(...g.compute);
      roles.period = g.rule;
      continue;
    }
    if (f.role === "custom" && !f.name.trim()) continue; // would orphan its capture
    const key = fieldKey(f);
    captures.push({
      pattern: f.pattern,
      flags: f.flags || undefined,
      outputs: {
        [key]: {
          group: groupOf(f.group),
          transform: f.transforms.length
            ? f.transforms.map(toTransformOp)
            : undefined,
        },
      },
    });
    if (f.role === "custom") {
      custom.push({
        name: f.name,
        source: key,
        type: f.type,
        unit: f.unit || undefined,
        includeWhen: f.includeWhen || undefined,
      });
    } else {
      roles[f.role] = { sources: [key] };
    }
  }
  return {
    captures,
    compute: compute.length ? compute : undefined,
    roles: roles as Body["roles"],
    custom: custom.length ? custom : undefined,
  };
}

// ── Reverse mapping (body -> Fields) ──────────────────────────────────────────
// Only configs the Fields editor can faithfully represent convert back. Anything
// using region/compute/validations, multi-output captures (barcodes), multi-
// source roles, or transforms outside the dropdown stays JSON-only.
const SIMPLE_TRANSFORMS = new Set([
  "numberAR",
  "numberUS",
  "centsToAmount",
  "stripLeadingZeros",
  "toInt",
  "monthOf",
  "monthYear",
  "lowercase",
]);

function transformOpToStr(op: TransformOp): string | null {
  if (typeof op === "string") return SIMPLE_TRANSFORMS.has(op) ? op : null;
  if ("parseDate" in op) return `parseDate:${op.parseDate}`;
  return null;
}

function reverseTransforms(ops: TransformOp[] | undefined): string[] | null {
  const out: string[] = [];
  for (const op of ops ?? []) {
    const s = transformOpToStr(op);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

type OutEntry = {
  cap: { pattern: string; flags?: string };
  group: number | string;
  transform?: TransformOp[];
};

function periodDateRow(e: OutEntry, shift: number): FieldRow | null {
  const t = reverseTransforms(e.transform);
  if (!t) return null;
  return {
    ...emptyField("period"),
    periodMode: "date",
    monthShift: shift,
    pattern: e.cap.pattern,
    flags: e.cap.flags ?? "",
    group: String(e.group),
    transforms: t,
  };
}

function periodPartsRow(
  monthE: OutEntry,
  yearE: OutEntry,
  shift: number,
): FieldRow {
  const monthIsName = (monthE.transform ?? []).some(
    (op) => typeof op === "object" && "lookup" in op,
  );
  return {
    ...emptyField("period"),
    periodMode: "parts",
    monthShift: shift,
    monthIsName,
    pattern: monthE.cap.pattern,
    flags: monthE.cap.flags ?? "",
    group: String(monthE.group),
    yearPattern: yearE.cap.pattern,
    yearFlags: yearE.cap.flags ?? "",
    yearGroup: String(yearE.group),
  };
}

/** Match the exact compute shapes `generatePeriod` emits, back into a period
 * row. Returns null for any other compute (those configs stay JSON-only). */
function recognizePeriodCompute(
  compute: Compute,
  sourceKey: string,
  outMap: Map<string, OutEntry>,
): { row: FieldRow; usedKeys: string[] } | null {
  const a = compute[0];
  const b = compute[1];
  // date mode + shift: [{ name: source, addMonths: { date: K, delta } }]
  if (compute.length === 1 && a.name === sourceKey && "addMonths" in a) {
    const e = outMap.get(a.addMonths.date);
    if (!e) return null;
    const row = periodDateRow(e, a.addMonths.delta);
    return row ? { row, usedKeys: [a.addMonths.date] } : null;
  }
  // parts mode, no shift: [{ name: source, dateFromParts: { year, month, day:1 } }]
  if (
    compute.length === 1 &&
    a.name === sourceKey &&
    "dateFromParts" in a &&
    a.dateFromParts.day === 1
  ) {
    const yE = outMap.get(a.dateFromParts.year);
    const mE = outMap.get(a.dateFromParts.month);
    if (!yE || !mE) return null;
    return {
      row: periodPartsRow(mE, yE, 0),
      usedKeys: [a.dateFromParts.year, a.dateFromParts.month],
    };
  }
  // parts mode + shift: dateFromParts named S, then addMonths over S named source
  if (
    compute.length === 2 &&
    "dateFromParts" in a &&
    a.dateFromParts.day === 1 &&
    "addMonths" in b &&
    b.name === sourceKey &&
    b.addMonths.date === a.name
  ) {
    const yE = outMap.get(a.dateFromParts.year);
    const mE = outMap.get(a.dateFromParts.month);
    if (!yE || !mE) return null;
    return {
      row: periodPartsRow(mE, yE, b.addMonths.delta),
      usedKeys: [a.dateFromParts.year, a.dateFromParts.month],
    };
  }
  return null;
}

function bodyToFields(body: Partial<Body>): FieldRow[] | null {
  if (body.region || body.validations?.length) return null;
  const captures = body.captures ?? [];
  const outMap = new Map<string, OutEntry>();
  for (const cap of captures) {
    const entries = Object.entries(cap.outputs);
    if (entries.length !== 1) return null; // barcode-style multi-output
    const [key, out] = entries[0];
    outMap.set(key, { cap, group: out.group, transform: out.transform });
  }

  const used = new Set<string>();

  // Period may derive through compute steps. Recognize the period-builder shapes
  // (and the legacy "sourced straight from a capture" form); bail on anything
  // else so complex configs open in the JSON editor.
  const periodSources = body.roles?.period?.sources;
  if (!periodSources || periodSources.length !== 1) return null;
  const compute = (body.compute ?? []) as Compute;
  let periodRow: FieldRow;
  if (compute.length === 0) {
    const e = outMap.get(periodSources[0]);
    if (!e) return null;
    const row = periodDateRow(e, 0);
    if (!row) return null;
    periodRow = row;
    used.add(periodSources[0]);
  } else {
    const r = recognizePeriodCompute(compute, periodSources[0], outMap);
    if (!r) return null;
    periodRow = r.row;
    for (const k of r.usedKeys) used.add(k);
  }

  const fields: FieldRow[] = [];
  for (const role of ROLES) {
    if (role === "period") {
      fields.push(periodRow);
      continue;
    }
    const rule = body.roles?.[role];
    if (!rule) {
      fields.push(emptyField(role)); // not mapped yet — still a simple draft
      continue;
    }
    if (rule.sources.length !== 1) return null; // coalesced
    const e = outMap.get(rule.sources[0]);
    if (!e) return null; // role sourced from a compute step
    const t = reverseTransforms(e.transform);
    if (!t) return null;
    fields.push({
      ...emptyField(role),
      pattern: e.cap.pattern,
      flags: e.cap.flags ?? "",
      group: String(e.group),
      transforms: t,
    });
    used.add(rule.sources[0]);
  }

  for (const cf of body.custom ?? []) {
    const e = outMap.get(cf.source);
    if (!e) return null;
    const t = reverseTransforms(e.transform);
    if (!t) return null;
    fields.push({
      ...emptyField("custom"),
      name: cf.name,
      type: cf.type,
      unit: cf.unit ?? "",
      includeWhen: cf.includeWhen ?? "",
      pattern: e.cap.pattern,
      flags: e.cap.flags ?? "",
      group: String(e.group),
      transforms: t,
    });
    used.add(cf.source);
  }

  // A capture nothing references can't be shown as a field.
  for (const key of outMap.keys()) if (!used.has(key)) return null;
  return fields;
}

// ── Highlighting ──────────────────────────────────────────────────────────────
type Span = { start: number; end: number; key: string };

function computeSpans(
  text: string,
  items: {
    key: string;
    pattern: string;
    flags?: string;
    group: number | string;
  }[],
): Span[] {
  const spans: Span[] = [];
  for (const it of items) {
    try {
      const re = new RegExp(it.pattern, `${it.flags ?? ""}d`);
      const m = re.exec(text);
      if (!m || !m.indices) continue;
      const gi =
        typeof it.group === "number"
          ? m.indices[it.group]
          : m.indices.groups?.[it.group];
      if (gi) spans.push({ start: gi[0], end: gi[1], key: it.key });
    } catch {
      // invalid regex while typing — ignore
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let last = -1;
  for (const s of spans) {
    if (s.start >= last) {
      out.push(s);
      last = s.end;
    }
  }
  return out;
}

function HighlightedText({ text, spans }: { text: string; spans: Span[] }) {
  if (spans.length === 0) return <>{text}</>;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) nodes.push(text.slice(cursor, s.start));
    nodes.push(
      <mark
        key={i}
        title={s.key}
        className="bg-[color-mix(in_srgb,var(--accent)_26%,transparent)] text-ink px-px"
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

// ── Page ──────────────────────────────────────────────────────────────────────
function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const billId = params.get("bill");
  const parserSlug = params.get("parser");
  const { showToast } = useApp();
  const utils = trpc.useUtils();

  const billQuery = trpc.bills.get.useQuery(
    { id: billId! },
    { enabled: Boolean(billId) },
  );
  const presets = trpc.parsers.list.useQuery();
  const vendorList = trpc.vendors.list.useQuery();

  // Working bills the parser is tested against (seed + dropped). Never saved
  // unless explicitly added as a sample.
  const [bills, setBills] = useState<{ name: string; text: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [seeded, setSeeded] = useState(false);

  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [existingId, setExistingId] = useState<string | null>(null);
  // False when the loaded parser is adopted/official (not owned): saving forks
  // it into a new owned copy rather than editing the original (which would 404).
  const [editingOwn, setEditingOwn] = useState(true);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vendorSlug, setVendorSlug] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [sigs, setSigs] = useState<Sig[]>([{ pattern: "", flags: "i" }]);
  const [noneSigs, setNoneSigs] = useState<Sig[]>([]);
  const [fields, setFields] = useState<FieldRow[]>(ROLES.map(emptyField));
  const [advanced, setAdvanced] = useState("");

  // Seed once from the loaded bill / preset.
  if (!seeded && (billId ? billQuery.data : true) && presets.data) {
    setSeeded(true);
    if (billQuery.data) {
      setBills([
        {
          name: billQuery.data.fileName ?? "bill",
          text: normalize(billQuery.data.rawText),
        },
      ]);
    }
    const preset =
      (parserSlug && presets.data.find((p) => p.slug === parserSlug)) ||
      (billQuery.data?.parserKey &&
        presets.data.find((p) => p.slug === billQuery.data!.parserKey));
    if (preset) {
      // Only an owned parser is edited in place; an adopted/official one is
      // forked on save, so leave existingId null and flag it.
      if (preset.editable) setExistingId(preset.id);
      else setEditingOwn(false);
      setSlug(preset.slug);
      setDisplayName(preset.displayName);
      setVendorSlug(preset.vendorSlug);
      setCategory(preset.category as Category);
      // Adopted rows carry a full ParserConfig in `body` (slug/vendor/version
      // included); own rows carry just the definition. Strip the metadata so
      // both normalize to a definition Body.
      const {
        slug: _bs,
        vendor: _bv,
        version: _bvn,
        ...bodyRest
      } = preset.body as Record<string, unknown>;
      void _bs;
      void _bv;
      void _bvn;
      const body = bodyRest as Body;
      setSigs(
        body.detect?.allOf?.length
          ? body.detect.allOf.map((s) => ({
              pattern: s.pattern,
              flags: s.flags ?? "",
            }))
          : [{ pattern: "", flags: "i" }],
      );
      setNoneSigs(
        (body.detect?.noneOf ?? []).map((s) => ({
          pattern: s.pattern,
          flags: s.flags ?? "",
        })),
      );
      const { detect: _omit, ...rest } = body;
      void _omit;
      // Open in the Fields editor when the config is simple enough; otherwise
      // (barcodes, derived periods, cross-checks) edit it as JSON.
      const asFields = bodyToFields(rest);
      if (asFields) {
        setFields(asFields);
        setMode("simple");
      } else {
        setAdvanced(JSON.stringify(rest, null, 2));
        setMode("advanced");
      }
    } else {
      // The bill references a parser slug with no saved config (e.g. bills
      // parsed by an older build). Prefill the identity so finishing recreates
      // that parser and reparse links the orphaned bills back to it.
      const orphan = parserSlug || billQuery.data?.parserKey;
      if (orphan) {
        setSlug(orphan);
        setVendorSlug(orphan);
        setDisplayName(orphan);
      }
    }
  }

  const activeText = bills[activeIdx]?.text ?? "";
  const knownVendor = (vendorList.data ?? []).some(
    (v) => v.slug === vendorSlug,
  );

  // Assemble the draft config (client-side; the engine is pure).
  const assembled = useMemo(() => {
    const { body, error, incomplete } =
      mode === "simple"
        ? assembleSimple(sigs, noneSigs, fields)
        : assembleAdvanced(sigs, noneSigs, advanced);
    if (!body) return { error, incomplete };
    const config: ParserConfig = {
      slug: slug || "draft",
      version: 1,
      vendor: {
        slug: vendorSlug || slug || "draft",
        displayName: displayName || "Draft",
        category,
      },
      ...body,
    };
    return { config, body };
  }, [
    mode,
    sigs,
    noneSigs,
    fields,
    advanced,
    slug,
    vendorSlug,
    displayName,
    category,
  ]);

  // Detection probe (works even before extraction is complete).
  const detectObj = useMemo(
    () => ({
      allOf: sigs.filter((s) => s.pattern.trim()),
      noneOf: noneSigs.filter((s) => s.pattern.trim()),
    }),
    [sigs, noneSigs],
  );
  const hasSignature = detectObj.allOf.length > 0;
  const matchesCurrent =
    hasSignature &&
    activeText.length > 0 &&
    detectScore({ detect: detectObj } as ParserConfig, activeText) !== null;

  const collisions = trpc.parsers.detectCollisions.useQuery(
    { detect: detectObj, excludeSlug: existingId ? slug : undefined },
    { enabled: hasSignature },
  );
  const collisionList = collisions.data ?? [];
  const gatePassed = matchesCurrent && collisionList.length === 0;

  // Live preview of extraction against the active bill.
  const preview = useMemo(() => {
    if (!assembled.config || !activeText) return null;
    try {
      const result: ParsedResult = runConfig(assembled.config, activeText);
      return { result, error: null as string | null };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [assembled.config, activeText]);

  // Spans to highlight in the active text. In Fields mode derive straight from
  // the rows so highlights appear as each regex is typed (before the whole
  // config is valid); in Advanced mode use the assembled captures.
  const spans = useMemo(() => {
    if (!activeText) return [];
    const items: {
      key: string;
      pattern: string;
      flags?: string;
      group: number | string;
    }[] = [];
    if (mode === "simple") {
      for (const f of fields) items.push(...fieldCaptureItems(f));
    } else if (assembled.body) {
      for (const cap of assembled.body.captures ?? []) {
        for (const [key, out] of Object.entries(cap.outputs)) {
          items.push({
            key,
            pattern: cap.pattern,
            flags: cap.flags,
            group: out.group,
          });
        }
      }
    }
    return computeSpans(activeText, items);
  }, [mode, fields, assembled.body, activeText]);

  const usage = trpc.parsers.usage.useQuery(
    { slug },
    { enabled: Boolean(slug) },
  );
  const samples = trpc.parsers.listSamples.useQuery(
    { slug },
    { enabled: Boolean(slug) },
  );

  // Tab switches convert between representations so neither side goes stale.
  // Blank JSON is always convertible (it just means "nothing yet") so the user
  // can never get stranded in Advanced.
  const simpleConvertible = useMemo(() => {
    if (mode === "simple" || !advanced.trim()) return true;
    try {
      return bodyToFields(JSON.parse(advanced)) !== null;
    } catch {
      return false;
    }
  }, [mode, advanced]);

  const switchToSimple = () => {
    if (mode === "simple") return;
    // Blank JSON: just go back, keeping whatever fields were already there.
    if (!advanced.trim()) {
      setMode("simple");
      return;
    }
    let parsed: Partial<Body>;
    try {
      parsed = JSON.parse(advanced);
    } catch {
      showToast("Fix the JSON before switching to Fields");
      return;
    }
    const f = bodyToFields(parsed);
    if (!f) {
      showToast("This parser uses advanced features — edit it as JSON");
      return;
    }
    setFields(f);
    setMode("simple");
  };

  const switchToAdvanced = () => {
    if (mode === "advanced") return;
    // Serialize partial work too, so nothing is lost on the way over.
    setAdvanced(JSON.stringify(fieldsToBodyDraft(fields), null, 2));
    setMode("advanced");
  };

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
  const canFinish =
    gatePassed &&
    slugValid &&
    displayName.trim().length > 0 &&
    Boolean(assembled.config) &&
    preview?.error == null &&
    preview?.result != null;

  const finish = async () => {
    if (!assembled.body) return;
    const input = {
      slug,
      displayName,
      vendorSlug: vendorSlug || slug,
      category,
      definition: assembled.body,
    };
    try {
      // Upsert by slug, but only against parsers you OWN: a previous attempt may
      // have saved before a later step failed (avoid a false slug conflict),
      // while an adopted parser with the same slug must be forked, not updated.
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
    <div className="mx-auto max-w-[80rem] px-5 pt-7 pb-20">
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

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 mt-[22px]">
        {/* ── Left: the bill text + test bills ── */}
        <div>
          <Label>Bill text</Label>
          {bills.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {bills.map((b, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={tabClass(i === activeIdx)}
                  title={b.name}
                >
                  {b.name.length > 18 ? `${b.name.slice(0, 16)}…` : b.name}
                </button>
              ))}
            </div>
          )}
          <pre className="ruled font-mono text-xs whitespace-pre-wrap break-words bg-paper border border-line py-2.5 px-3 h-[58vh] overflow-y-auto">
            {activeText ? (
              <HighlightedText text={activeText} spans={spans} />
            ) : (
              "Drop a PDF to start."
            )}
          </pre>

          <DropZone onFiles={dropFiles} />

          {slug && (
            <div className="mt-3">
              <Label>Saved samples ({samples.data?.length ?? 0})</Label>
              <div className="flex flex-wrap gap-1.5">
                {(samples.data ?? []).map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      setBills((b) => {
                        const next = [
                          ...b,
                          {
                            name: s.fileName ?? "sample",
                            text: normalize(s.rawText),
                          },
                        ];
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
                      await addSample.mutateAsync({
                        slug,
                        fileName: bills[activeIdx]?.name,
                        rawText: activeText,
                      });
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

        {/* ── Right: the editor ── */}
        <div className="flex flex-col gap-5">
          {/* metadata */}
          <Section title="Parser">
            <Grid>
              <Field label="Name">
                <Input
                  value={displayName}
                  placeholder="e.g. Aguas Andinas"
                  onChange={(e) => setDisplayName(e.target.value)}
                />
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
                    if (val === "__new__") {
                      setVendorSlug("");
                      return;
                    }
                    setVendorSlug(val);
                    const v = (vendorList.data ?? []).find(
                      (x) => x.slug === val,
                    );
                    if (v) setCategory(v.category as Category);
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
              <Field label="Category">
                <Select
                  value={category}
                  disabled={knownVendor}
                  onChange={(e) => setCategory(e.target.value as Category)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              {!knownVendor && (
                <Field label="New vendor slug">
                  <Input
                    value={vendorSlug}
                    placeholder={slug || "vendor"}
                    onChange={(e) => setVendorSlug(e.target.value)}
                  />
                </Field>
              )}
            </Grid>
            {!knownVendor && (
              <p className={`${hint} mt-2`}>
                Point a second parser at an existing vendor to merge them — e.g.
                an old and new administrator both filed under one “Expensas”.
              </p>
            )}
          </Section>

          {/* step 1 — detection */}
          <Section title="1 · Recognize the bill">
            <p className={`${hint} mb-2.5`}>
              Patterns that uniquely identify this vendor. All must appear in
              the text, and they must not match any of your other bills.
            </p>
            {sigs.map((s, i) => (
              <SigRow
                key={i}
                sig={s}
                onChange={(ns) =>
                  setSigs(sigs.map((x, j) => (j === i ? ns : x)))
                }
                onRemove={
                  sigs.length > 1
                    ? () => setSigs(sigs.filter((_, j) => j !== i))
                    : undefined
                }
              />
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSigs([...sigs, { pattern: "", flags: "i" }])}
            >
              + Add signature
            </Button>

            <div className="mt-3 flex flex-col gap-1.5">
              <StatusLine
                ok={matchesCurrent}
                text={
                  matchesCurrent
                    ? "Matches this bill"
                    : "Does not match this bill yet"
                }
              />
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
          <Section title="2 · Extract the data" dim={!gatePassed}>
            {!gatePassed ? (
              <p className={`${hint} mb-2.5`}>
                Finish step 1 to unlock extraction.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-3">
                  <ModeTab
                    active={mode === "simple"}
                    disabled={!simpleConvertible}
                    onClick={switchToSimple}
                  >
                    Fields
                  </ModeTab>
                  <ModeTab
                    active={mode === "advanced"}
                    onClick={switchToAdvanced}
                  >
                    Advanced (JSON)
                  </ModeTab>
                  {!simpleConvertible && (
                    <span className={hint}>
                      uses advanced features — JSON only
                    </span>
                  )}
                </div>

                {mode === "simple" ? (
                  <>
                    {fields.map((f) =>
                      f.role === "period" ? (
                        <PeriodEditor
                          key={f.id}
                          field={f}
                          onChange={(nf) =>
                            setFields(
                              fields.map((x) => (x.id === f.id ? nf : x)),
                            )
                          }
                          value={extractPeriodValue(activeText, f)}
                        />
                      ) : (
                        <FieldEditor
                          key={f.id}
                          field={f}
                          onChange={(nf) =>
                            setFields(
                              fields.map((x) => (x.id === f.id ? nf : x)),
                            )
                          }
                          onRemove={
                            f.role === "custom"
                              ? () =>
                                  setFields(fields.filter((x) => x.id !== f.id))
                              : undefined
                          }
                          value={extractFieldValue(activeText, f)}
                        />
                      ),
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setFields([...fields, emptyField("custom")])
                      }
                    >
                      + Add custom field
                    </Button>
                  </>
                ) : (
                  <>
                    <p className={`${hint} mb-2.5`}>
                      The full extraction body (captures, compute, validations,
                      roles, custom). For barcodes and derived periods.
                    </p>
                    <textarea
                      value={advanced}
                      onChange={(e) => setAdvanced(e.target.value)}
                      spellCheck={false}
                      className="w-full min-h-[280px] font-mono text-xs bg-paper border border-line py-2.5 px-3 resize-y"
                    />
                  </>
                )}

                {/* preview */}
                <div className="mt-[14px]">
                  <Label>Preview</Label>
                  {assembled.incomplete ? (
                    <p className={`${hint} mb-2.5`}>
                      Add a regex to every field — each value previews live
                      above and highlights in the bill text.
                    </p>
                  ) : assembled.error ? (
                    <ErrorBox text={assembled.error} />
                  ) : preview?.error ? (
                    <ErrorBox text={preview.error} />
                  ) : preview?.result ? (
                    <PreviewBox result={preview.result} />
                  ) : (
                    <p className={`${hint} mb-2.5`}>
                      Define fields to see the result.
                    </p>
                  )}
                </div>
              </>
            )}
          </Section>

          {/* finish */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="solid"
              size="lg"
              disabled={
                !canFinish ||
                createParser.isPending ||
                updateParser.isPending ||
                reparse.isPending
              }
              onClick={finish}
            >
              {!editingOwn
                ? "Fork & save"
                : existingId
                  ? "Save & reparse"
                  : "Finish"}
            </Button>
            {slug && usage.data && usage.data.count > 0 && (
              <span className={hint}>
                Saving re-runs this parser against {usage.data.count} existing
                bill(s).
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────
function SigRow({
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

function FieldEditor({
  field,
  onChange,
  onRemove,
  value,
}: {
  field: FieldRow;
  onChange: (f: FieldRow) => void;
  onRemove?: () => void;
  value?: string;
}) {
  const isCustom = field.role === "custom";
  return (
    <div className="border border-line p-3 mb-2.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs font-semibold flex-1">
          {field.role === "custom" ? (
            <Input
              value={field.name}
              placeholder="field name (e.g. consumption)"
              onChange={(e) => onChange({ ...field, name: e.target.value })}
            />
          ) : (
            ROLE_LABEL[field.role]
          )}
        </span>
        {value !== undefined ? (
          <Badge>{value}</Badge>
        ) : (
          <Badge tone="neutral">no match</Badge>
        )}
        {onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            ✕
          </Button>
        )}
      </div>

      {isCustom && (
        <Grid>
          <Field label="Type">
            <Select
              value={field.type}
              onChange={(e) =>
                onChange({ ...field, type: e.target.value as FieldRow["type"] })
              }
            >
              {["money", "number", "date", "string", "quantity"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          {field.type === "quantity" && (
            <Field label="Unit">
              <Input
                value={field.unit}
                placeholder="kWh, m³, GB…"
                onChange={(e) => onChange({ ...field, unit: e.target.value })}
              />
            </Field>
          )}
          <Field label="Only when (optional)">
            <Input
              value={field.includeWhen}
              placeholder="e.g. f_extra > 0 — leave blank to always keep"
              onChange={(e) =>
                onChange({ ...field, includeWhen: e.target.value })
              }
            />
          </Field>
        </Grid>
      )}

      <div className="flex gap-1.5 mt-2">
        <Input
          value={field.pattern}
          placeholder="regex with a (capture group)"
          onChange={(e) => onChange({ ...field, pattern: e.target.value })}
        />
        <Input
          value={field.flags}
          placeholder="i"
          className="w-12 flex-none"
          onChange={(e) => onChange({ ...field, flags: e.target.value })}
        />
        <Input
          value={field.group}
          placeholder="1"
          className="w-14 flex-none"
          title="capture group (number or name)"
          onChange={(e) => onChange({ ...field, group: e.target.value })}
        />
      </div>

      <TransformsEditor
        transforms={field.transforms}
        onChange={(t) => onChange({ ...field, transforms: t })}
      />
    </div>
  );
}

/** The ordered transform-pipeline picker, shared by custom fields and the
 * period builder's "whole date" mode. */
function TransformsEditor({
  transforms,
  onChange,
}: {
  transforms: string[];
  onChange: (t: string[]) => void;
}) {
  return (
    <div className="mt-2">
      <span className={miniLabel}>Transforms</span>
      <div className="flex flex-wrap gap-1.5 mt-1 items-center">
        {transforms.map((t, i) => (
          <span key={i} className="inline-flex gap-1 items-center">
            <Select
              value={t}
              className="w-auto"
              onChange={(e) =>
                onChange(
                  transforms.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
            >
              {TRANSFORMS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <button
              onClick={() => onChange(transforms.filter((_, j) => j !== i))}
              className={xBtn}
            >
              ✕
            </button>
          </span>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...transforms, TRANSFORMS[0].value])}
        >
          + transform
        </Button>
      </div>
    </div>
  );
}

/** The period role's structured editor: a captured date (with format
 * transforms) or month + year parts, either way optionally shifted ±N months.
 * Generates dateFromParts / addMonths under the hood (see generatePeriod). */
function PeriodEditor({
  field,
  onChange,
  value,
}: {
  field: FieldRow;
  onChange: (f: FieldRow) => void;
  value?: string;
}) {
  const isParts = field.periodMode === "parts";
  return (
    <div className="border border-line p-3 mb-2.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs font-semibold flex-1">
          {ROLE_LABEL.period}
        </span>
        {value !== undefined ? (
          <Badge>{value}</Badge>
        ) : (
          <Badge tone="neutral">no match</Badge>
        )}
      </div>

      <div className="flex gap-1.5 mb-2.5">
        <button
          onClick={() => onChange({ ...field, periodMode: "date" })}
          className={tabClass(!isParts)}
        >
          Whole date
        </button>
        <button
          onClick={() => onChange({ ...field, periodMode: "parts" })}
          className={tabClass(isParts)}
        >
          Month + year
        </button>
      </div>

      {isParts ? (
        <>
          <span className={miniLabel}>Month</span>
          <div className="flex gap-1.5 mt-1 mb-2">
            <Input
              value={field.pattern}
              placeholder="regex with a (month group)"
              onChange={(e) => onChange({ ...field, pattern: e.target.value })}
            />
            <Input
              value={field.flags}
              placeholder="i"
              className="w-12 flex-none"
              onChange={(e) => onChange({ ...field, flags: e.target.value })}
            />
            <Input
              value={field.group}
              placeholder="1"
              className="w-14 flex-none"
              onChange={(e) => onChange({ ...field, group: e.target.value })}
            />
          </div>
          <label
            className={cn(
              "inline-flex items-center gap-1.5 mb-2.5 cursor-pointer",
              miniLabel,
            )}
          >
            <input
              type="checkbox"
              checked={field.monthIsName}
              onChange={(e) =>
                onChange({ ...field, monthIsName: e.target.checked })
              }
            />
            Month is a name (Ene / February)
          </label>
          <span className={miniLabel}>Year</span>
          <div className="flex gap-1.5 mt-1">
            <Input
              value={field.yearPattern}
              placeholder="regex with a (year group)"
              onChange={(e) =>
                onChange({ ...field, yearPattern: e.target.value })
              }
            />
            <Input
              value={field.yearFlags}
              placeholder="i"
              className="w-12 flex-none"
              onChange={(e) =>
                onChange({ ...field, yearFlags: e.target.value })
              }
            />
            <Input
              value={field.yearGroup}
              placeholder="1"
              className="w-14 flex-none"
              onChange={(e) =>
                onChange({ ...field, yearGroup: e.target.value })
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-1.5">
            <Input
              value={field.pattern}
              placeholder="regex with a (date group)"
              onChange={(e) => onChange({ ...field, pattern: e.target.value })}
            />
            <Input
              value={field.flags}
              placeholder="i"
              className="w-12 flex-none"
              onChange={(e) => onChange({ ...field, flags: e.target.value })}
            />
            <Input
              value={field.group}
              placeholder="1"
              className="w-14 flex-none"
              onChange={(e) => onChange({ ...field, group: e.target.value })}
            />
          </div>
          <TransformsEditor
            transforms={field.transforms}
            onChange={(t) => onChange({ ...field, transforms: t })}
          />
        </>
      )}

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <span className={miniLabel}>Shift months</span>
        <Input
          type="number"
          value={String(field.monthShift)}
          className="w-[72px] flex-none"
          onChange={(e) =>
            onChange({
              ...field,
              monthShift: Math.trunc(Number(e.target.value) || 0),
            })
          }
        />
        <span className={hint}>
          −1 = previous month · +1 = next · rolls the year
        </span>
      </div>
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

function PreviewBox({ result }: { result: ParsedResult }) {
  const rows: [string, string][] = [
    ["Account / ID", result.identity],
    ["Amount", String(result.amount)],
    ["Period", result.period],
    ["Due date", result.dueDate],
    ...Object.entries(result.custom).map(
      ([k, v]) =>
        [
          k,
          typeof v === "object"
            ? `${v.value}${v.unit ? ` ${v.unit}` : ""}`
            : String(v),
        ] as [string, string],
    ),
  ];
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
          <span>{v}</span>
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
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs",
        ok ? "text-ink" : "text-muted",
      )}
    >
      <span
        className={cn(
          "w-2 h-2 inline-block flex-none",
          ok ? "bg-accent" : "bg-line",
        )}
      />
      {text}
    </span>
  );
}

function Section({
  title,
  children,
  dim,
}: {
  title: string;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <section
      className={cn(
        "border border-line p-4 transition-opacity duration-200",
        dim ? "opacity-55 pointer-events-none" : "opacity-100",
      )}
    >
      <h3 className="font-mono text-micro uppercase tracking-label text-accent mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className={miniLabel}>{label}</span>
      {children}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className={`${miniLabel} mb-1.5`}>{children}</p>;
}

function ModeTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        tabClass(active),
        "disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

const miniLabel =
  "font-mono text-[10px] uppercase tracking-[0.14em] text-muted";

// Hint text — the block-level spacing (mb-2.5) is added per-use so it can be
// dropped where the hint sits inline.
const hint = "font-mono text-[11.5px] text-muted leading-[1.6]";

const xBtn = "border-none bg-transparent cursor-pointer text-muted text-xs";

function tabClass(active: boolean): string {
  return cn(
    "font-mono text-micro uppercase tracking-[0.1em] py-[5px] px-2.5 cursor-pointer border transition-colors",
    active
      ? "border-ink bg-ink text-paper"
      : "border-line bg-transparent text-muted",
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}
