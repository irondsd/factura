"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Display, Eyebrow } from "@/components/charts/primitives";
import {
  Button,
  ErrorBox,
  Field,
  Input,
  Label,
  Section,
  Select,
  StatusLine,
  Tab,
  hint,
  tabClass,
} from "@/components/ui";
import { detectScore, runConfig } from "@/parsers/engine/evaluate";
import type { ParserConfig } from "@/parsers/engine/types";
import { evaluateConfig } from "@/parsers/builder/evaluate";
import type { ValueRec } from "@/parsers/builder/evaluate";
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
import { useToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import {
  CaptureCard,
  CustomCard,
  DeriveCard,
  RoleCard,
  ValueChip,
} from "./cards";
import { HighlightedText, bodySpans, structuredSpans } from "./highlight";
import { allOptions, moveArr, optionsBeforeDerive } from "./options";
import { DropZone, Grid, SigRow, SubHead } from "./parts";
import type { Sig } from "./parts";
import { ParsedPreview, ReviewBox, StructuredPreview } from "./previews";
import { RegexToolkit } from "./RegexToolkit";

type Mode = "structured" | "json";

function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const billId = params.get("bill");
  const parserSlug = params.get("parser");
  const { showToast } = useToast();
  const utils = trpc.useUtils();

  const billQuery = trpc.bills.get.useQuery(
    { id: billId! },
    { enabled: Boolean(billId) },
  );
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
      if (preset.editable) setExistingId(preset.id);
      else setEditingOwn(false);
      setLoadedSlug(preset.slug);
      setSlug(preset.slug);
      setDisplayName(preset.displayName);
      setVendorSlug(preset.vendorSlug);
      const {
        slug: _s,
        vendor: _v,
        version: _vn,
        ...bodyRest
      } = preset.body as Record<string, unknown>;
      void _s;
      void _v;
      void _vn;
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
  const knownVendor = (vendorList.data ?? []).some(
    (v) => v.slug === vendorSlug,
  );

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
    () =>
      mode === "structured" && activeText
        ? evaluateConfig(activeText, config)
        : null,
    [mode, activeText, config],
  );

  // JSON mode: final result via the real engine.
  const jsonPreview = useMemo(() => {
    if (mode !== "json" || !assembled.body || !activeText) return null;
    const full: ParserConfig = {
      slug: slug || "draft",
      version: 1,
      vendor: {
        slug: vendorSlug || slug || "draft",
        displayName: displayName || "Draft",
      },
      ...assembled.body,
    };
    try {
      return {
        result: runConfig(full, activeText),
        error: null as string | null,
      };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : String(e),
      };
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

  const setCaptures = (captures: BuilderConfig["captures"]) =>
    setConfig((c) => ({ ...c, captures }));
  const setDerives = (derives: BuilderConfig["derives"]) =>
    setConfig((c) => ({ ...c, derives }));
  const setCustom = (custom: BuilderConfig["custom"]) =>
    setConfig((c) => ({ ...c, custom }));

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

  const usage = trpc.parsers.usage.useQuery(
    { slug },
    { enabled: Boolean(slug) },
  );
  const samples = trpc.parsers.listSamples.useQuery(
    { slug },
    { enabled: Boolean(slug) },
  );

  const toJson = () => {
    // Body for the JSON editor mirrors what we'd save, minus the separately-
    // edited detect block (step 1 owns that in both modes).
    const { detect: _d, ...rest } = generateBody(config, {
      allOf: [],
      noneOf: [],
    });
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
    mode === "structured"
      ? Boolean(structResult?.resolved)
      : jsonPreview?.result != null;
  const canFinish =
    gatePassed &&
    slugValid &&
    displayName.trim().length > 0 &&
    Boolean(assembled.body) &&
    !assembled.error &&
    previewOk;

  const finish = async () => {
    if (!assembled.body) return;
    const input = {
      slug,
      displayName,
      vendorSlug: vendorSlug || slug,
      definition: assembled.body,
    };
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
      router.push("/app/bills");
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
        <Button variant="ghost" onClick={() => router.push("/app/bills")}>
          ← Back to bills
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 mt-[22px] items-start">
        {/* ── Left: bill text ── */}
        <div className="md:sticky md:top-4">
          <div className="flex items-center justify-between mb-2">
            <Label>Bill text</Label>
            {mode === "structured" && (
              <span className="font-mono text-[10.5px] text-muted">
                focus a value to highlight its span →
              </span>
            )}
          </div>
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
          <pre className="ruled font-mono text-xs leading-[1.55] whitespace-pre-wrap break-words bg-paper border border-line py-2.5 px-3 h-[62vh] overflow-y-auto m-0 text-ink">
            {activeText ? (
              <HighlightedText text={activeText} spans={spans} />
            ) : (
              "Drop a PDF to start."
            )}
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

        {/* ── Right: editor ── */}
        <div className="flex flex-col gap-5">
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
                  <Input
                    value={vendorSlug}
                    placeholder={slug || "vendor"}
                    onChange={(e) => setVendorSlug(e.target.value)}
                  />
                </Field>
              )}
            </Grid>
          </Section>

          {/* step 1 — detection */}
          <Section title="1 · Recognize the bill">
            <p className={cn(hint, "mb-2.5")}>
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
            <div className="mt-4">
              <p className={cn(hint, "mb-2.5")}>
                Optional — patterns that must <em>not</em> appear. Splits one
                vendor across two parsers.
              </p>
              {noneSigs.map((s, i) => (
                <SigRow
                  key={i}
                  sig={s}
                  onChange={(ns) =>
                    setNoneSigs(noneSigs.map((x, j) => (j === i ? ns : x)))
                  }
                  onRemove={() =>
                    setNoneSigs(noneSigs.filter((_, j) => j !== i))
                  }
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setNoneSigs([...noneSigs, { pattern: "", flags: "i" }])
                }
              >
                + Add exclusion
              </Button>
            </div>
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
          <Section
            title="2 · Extract the data"
            dim={!gatePassed}
            right={
              gatePassed ? (
                <div className="flex gap-1.5">
                  <Tab active={mode === "structured"} onClick={toStructured}>
                    Structured
                  </Tab>
                  <Tab active={mode === "json"} onClick={toJson}>
                    Advanced (JSON)
                  </Tab>
                </div>
              ) : undefined
            }
          >
            {!gatePassed ? (
              <p className={cn(hint, "mb-2.5")}>
                Finish step 1 to unlock extraction.
              </p>
            ) : mode === "json" ? (
              <>
                <p className={cn(hint, "mb-2")}>
                  The underlying engine body — captures, compute, roles, custom.
                  Edits preview live below.
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
                {assembled.error && (
                  <p className={cn(hint, "text-accent mt-1.5")}>
                    △ {assembled.error}
                  </p>
                )}
              </>
            ) : (
              <>
                <SubHead
                  label="Extract — capture from the bill"
                  sub="Each card is one regex producing one or more named values."
                />
                {config.captures.length === 0 && (
                  <p className={cn(hint, "mb-2.5")}>
                    Nothing captured yet. Add a capture to read a value off the
                    bill.
                  </p>
                )}
                {config.captures.map((cap, i) => (
                  <CaptureCard
                    key={cap.id}
                    cap={cap}
                    recOf={recOf}
                    onPreview={onPreview}
                    onChange={(nc) =>
                      setCaptures(
                        config.captures.map((x, j) => (j === i ? nc : x)),
                      )
                    }
                    onRemove={() =>
                      setCaptures(config.captures.filter((_, j) => j !== i))
                    }
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCaptures([...config.captures, newCapture()])
                  }
                >
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
                    onChange={(nd) =>
                      setDerives(
                        config.derives.map((x, j) => (j === i ? nd : x)),
                      )
                    }
                    onRemove={() =>
                      setDerives(config.derives.filter((_, j) => j !== i))
                    }
                    moveUp={() => setDerives(moveArr(config.derives, i, -1))}
                    moveDown={() => setDerives(moveArr(config.derives, i, 1))}
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDerives([...config.derives, newDerive()])}
                >
                  + add derived value
                </Button>

                <div className="h-4" />
                <SubHead
                  label="Roles — the four required slots"
                  sub="Point each slot at a value. Add fallbacks for bills that print it differently."
                />
                {ROLE_KEYS.map((key) => (
                  <RoleCard
                    key={key}
                    label={ROLE_LABEL[key]}
                    role={config.roles[key]}
                    resolved={structResult?.roleOut[key]}
                    options={allOptions(config, values)}
                    onPreview={onPreview}
                    focusKey={focusKey}
                    onChange={(r) =>
                      setConfig((c) => ({
                        ...c,
                        roles: { ...c.roles, [key]: r },
                      }))
                    }
                  />
                ))}

                <div className="h-4" />
                <SubHead
                  label="Custom fields"
                  sub="Anything else worth tracking — charted later."
                />
                {config.custom.map((cf, i) => (
                  <CustomCard
                    key={cf.id}
                    field={cf}
                    recOf={recOf}
                    options={allOptions(config, values)}
                    onPreview={onPreview}
                    focusKey={focusKey}
                    onChange={(nf) =>
                      setCustom(config.custom.map((x, j) => (j === i ? nf : x)))
                    }
                    onRemove={() =>
                      setCustom(config.custom.filter((_, j) => j !== i))
                    }
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCustom([...config.custom, newCustom()])}
                >
                  + add custom field
                </Button>
              </>
            )}

            {/* preview / review */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Label>
                  {mode === "structured" && structResult?.issues.length
                    ? "Needs review"
                    : "Preview"}
                </Label>
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
                  <p className={cn(hint, "mb-2.5")}>
                    Define fields to see the result.
                  </p>
                )
              ) : assembled.error ? (
                <ErrorBox text={assembled.error} />
              ) : jsonPreview?.error ? (
                <ErrorBox text={jsonPreview.error} />
              ) : jsonPreview?.result ? (
                <ParsedPreview result={jsonPreview.result} />
              ) : (
                <p className={cn(hint, "mb-2.5")}>
                  Define fields to see the result.
                </p>
              )}
            </div>
          </Section>

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

export default function BuilderPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}
