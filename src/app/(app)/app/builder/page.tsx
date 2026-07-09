"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";
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
} from "@/parsers/builder/model";
import type { BuilderConfig } from "@/parsers/builder/model";
import { normalize } from "@/parsers/normalize";
import { PARSER_CATEGORIES } from "@/parsers/categories";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
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

/** Select sentinel for the free-text "Other" category option. */
const CATEGORY_OTHER = "__other__";

type MarkStatus = "ok" | "bad" | "none";

/** Field validity for the inline mark: valid → ok; invalid with content → bad;
 * empty → only bad once a finish was attempted, otherwise unmarked. */
function markStatus(value: string, valid: boolean, tried: boolean): MarkStatus {
  if (valid) return "ok";
  if (value.trim().length > 0) return "bad";
  return tried ? "bad" : "none";
}

/** Wraps an Input with a right-aligned ✓/✕ and a red border when invalid. */
function MarkedField({
  label,
  status,
  children,
}: {
  label: React.ReactNode;
  status: MarkStatus;
  children: React.ReactNode;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        {children}
        {status !== "none" && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] leading-none",
              status === "ok" ? "text-ok" : "text-accent",
            )}
          >
            {status === "ok" ? "✓" : "✕"}
          </span>
        )}
      </div>
    </Field>
  );
}

function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const billId = params.get("bill");
  const parserSlug = params.get("parser");
  const { showToast } = useToast();
  const { t } = useI18n();
  const tbu = t.builder;
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
  // Catalog metadata surfaced in the parser library. `categoryChoice` is either
  // a built-in key, "" (none), or CATEGORY_OTHER; a custom label lives in
  // `customCategory` and is only used when "Other" is chosen.
  const [categoryChoice, setCategoryChoice] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [region, setRegion] = useState("");
  const [provider, setProvider] = useState("");
  const [compat, setCompat] = useState("");
  // Set once when this parser is opened as a fork of an adopted/marketplace one.
  const [forkedFrom, setForkedFrom] = useState<string | null>(null);
  const [sigs, setSigs] = useState<Sig[]>([{ pattern: "", flags: "i" }]);
  const [noneSigs, setNoneSigs] = useState<Sig[]>([]);
  const [config, setConfig] = useState<BuilderConfig>(() => emptyConfig());
  const [advanced, setAdvanced] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // True once a finish attempt is blocked by invalid identity fields, so empty
  // fields only flag red after the user tries to finish (not on first load).
  const [finishTried, setFinishTried] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const vendorSlugRef = useRef<HTMLInputElement>(null);

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
      else {
        setEditingOwn(false);
        // Forking an adopted/marketplace parser: record its lineage so the
        // saved copy shows "↳ forked from …" in the library.
        setForkedFrom(`${preset.displayName} v${preset.version}`);
      }
      setLoadedSlug(preset.slug);
      setSlug(preset.slug);
      setDisplayName(preset.displayName);
      setVendorSlug(preset.vendorSlug);
      // A known key selects its option; anything else is a custom label that
      // opens the "Other" free-text field prefilled.
      const presetCat = preset.category ?? "";
      if (
        presetCat &&
        !(PARSER_CATEGORIES as readonly string[]).includes(presetCat)
      ) {
        setCategoryChoice(CATEGORY_OTHER);
        setCustomCategory(presetCat);
      } else {
        setCategoryChoice(presetCat);
        setCustomCategory("");
      }
      setRegion(preset.region ?? "");
      setProvider(preset.provider ?? "");
      setCompat(preset.compat ?? "");
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
    if (!advanced.trim()) return { error: tbu.addDefinition };
    try {
      const parsed = JSON.parse(advanced) as Record<string, unknown>;
      return { body: { ...(parsed as object), detect: detectObj } as Body };
    } catch (e) {
      return {
        error: interpolate(tbu.invalidJson, {
          msg: e instanceof Error ? e.message : String(e),
        }),
      };
    }
  }, [mode, config, sigs, noneSigs, advanced, detectObj, tbu]);

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
          showToast(interpolate(tbu.noTextFound, { file: file.name }));
          continue;
        }
        setBills((b) => {
          const next = [...b, { name: file.name, text: normalize(raw) }];
          setActiveIdx(next.length - 1);
          return next;
        });
      } catch {
        showToast(interpolate(tbu.couldNotRead, { file: file.name }));
      }
    }
  };

  const slugValid = /^[a-z0-9-]+$/.test(slug);
  const previewOk =
    mode === "structured"
      ? Boolean(structResult?.resolved)
      : jsonPreview?.result != null;
  // Identity fields are validated inline (✓/✕ in the field). The vendor slug is
  // only required when creating a new vendor; both slugs must match the server
  // regex (parserSchema) or the save round-trips into a failed-save toast.
  const nameValid = displayName.trim().length > 0;
  // Empty vendor slug is allowed — finish() falls back to the parser slug. Only
  // a *filled* vendor slug must match the server regex.
  const vendorSlugFilled = vendorSlug.trim().length > 0;
  const vendorSlugValid =
    knownVendor || !vendorSlugFilled || /^[a-z0-9-]+$/.test(vendorSlug);
  const fieldsValid = nameValid && slugValid && vendorSlugValid;

  const canFinish =
    gatePassed &&
    fieldsValid &&
    Boolean(assembled.body) &&
    !assembled.error &&
    previewOk;

  const nameStatus = markStatus(displayName, nameValid, finishTried);
  const slugStatus = markStatus(slug, slugValid, finishTried);
  // Vendor slug is optional (inherits the parser slug), so an empty one stays
  // unmarked; only flag a filled-but-malformed value.
  const vendorSlugStatus: MarkStatus =
    knownVendor || !vendorSlugFilled
      ? "none"
      : markStatus(vendorSlug, vendorSlugValid, finishTried);

  // First invalid identity field, in top-to-bottom order, for focus-on-submit.
  const firstInvalidField = !nameValid
    ? nameRef
    : !slugValid
      ? slugRef
      : !vendorSlugValid
        ? vendorSlugRef
        : null;

  const finish = async () => {
    if (!fieldsValid) {
      setFinishTried(true);
      const el = firstInvalidField?.current;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    // Fields are fine but something upstream isn't (step 1 / preview) — say so
    // rather than silently doing nothing.
    if (!canFinish) {
      const blockers = [
        !gatePassed && tbu.needGate,
        (!previewOk || assembled.error) && tbu.needPreview,
      ].filter((x): x is string => Boolean(x));
      showToast(interpolate(tbu.finishNeeds, { list: blockers.join(", ") }));
      return;
    }
    if (!assembled.body) return;
    const input = {
      slug,
      displayName,
      vendorSlug: vendorSlug || slug,
      definition: assembled.body,
      category:
        (categoryChoice === CATEGORY_OTHER
          ? customCategory.trim()
          : categoryChoice) || undefined,
      region: region.trim() || undefined,
      provider: provider.trim() || undefined,
      compat: compat.trim() || undefined,
      forkedFrom: forkedFrom ?? undefined,
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
        posthog.capture("parser_created", { slug, display_name: displayName });
        setExistingId(created.id);
        setEditingOwn(true);
      }
      const res = await reparse.mutateAsync({ slug });
      showToast(
        interpolate(
          res.updated === 1
            ? tbu.parserSavedReparsedOne
            : tbu.parserSavedReparsedOther,
          { n: res.updated },
        ),
      );
      utils.invalidate();
      router.push("/app/bills");
    } catch (e) {
      showToast(
        interpolate(tbu.saveFailed, {
          msg: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  return (
    <div className="mx-auto max-w-[84rem] px-5 pt-7 pb-20">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>
            {tbu.eyebrow} {existingId ? tbu.titleEditing : tbu.titleNew}
          </Eyebrow>
          <Display size={30} className="block mt-1.5">
            {displayName || tbu.untitled}
          </Display>
        </div>
        <Button variant="ghost" onClick={() => router.push("/app/bills")}>
          {tbu.backToBills}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 mt-[22px] items-start">
        {/* ── Left: bill text ── */}
        <div className="md:sticky md:top-4">
          <div className="flex items-center justify-between mb-2">
            <Label>{tbu.billText}</Label>
            {mode === "structured" && (
              <span className="font-mono text-[10.5px] text-muted">
                {tbu.focusHint}
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
              tbu.dropToStart
            )}
          </pre>
          <DropZone onFiles={dropFiles} />
          <RegexToolkit
            text={activeText}
            onCopy={(p) => {
              navigator.clipboard?.writeText(p);
              showToast(tbu.patternCopied);
            }}
          />
          {slug && (
            <div className="mt-3">
              <Label>
                {interpolate(tbu.savedSamplesLabel, {
                  n: samples.data?.length ?? 0,
                })}
              </Label>
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
                      showToast(tbu.savedSample);
                    }}
                  >
                    {tbu.saveAsSample}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: editor ── */}
        <div className="flex flex-col gap-5">
          <Section title={tbu.parserSection}>
            <Grid>
              <MarkedField label={tbu.name} status={nameStatus}>
                <Input
                  ref={nameRef}
                  value={displayName}
                  placeholder={tbu.namePlaceholder}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={cn("pr-8", nameStatus === "bad" && "border-accent")}
                />
              </MarkedField>
              <MarkedField label={tbu.slug} status={slugStatus}>
                <Input
                  ref={slugRef}
                  value={slug}
                  placeholder="aguas-andinas"
                  onChange={(e) => setSlug(e.target.value)}
                  className={cn("pr-8", slugStatus === "bad" && "border-accent")}
                />
              </MarkedField>
              <Field label={tbu.vendorGroup}>
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
                  <option value="__new__">{tbu.newVendorOption}</option>
                </Select>
              </Field>
              {!knownVendor && (
                <MarkedField
                  label={tbu.newVendorSlug}
                  status={vendorSlugStatus}
                >
                  <Input
                    ref={vendorSlugRef}
                    value={vendorSlug}
                    placeholder={slug || tbu.vendorPlaceholder}
                    onChange={(e) => setVendorSlug(e.target.value)}
                    className={cn(
                      "pr-8",
                      vendorSlugStatus === "bad" && "border-accent",
                    )}
                  />
                </MarkedField>
              )}
              <Field label={tbu.category}>
                <Select
                  value={categoryChoice}
                  onChange={(e) => setCategoryChoice(e.target.value)}
                >
                  <option value="">{tbu.categoryNone}</option>
                  {PARSER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t.parsers.categories[c]}
                    </option>
                  ))}
                  <option value={CATEGORY_OTHER}>{tbu.categoryOther}</option>
                </Select>
              </Field>
              {categoryChoice === CATEGORY_OTHER && (
                <Field label={tbu.categoryCustom}>
                  <Input
                    value={customCategory}
                    placeholder={tbu.categoryCustomPlaceholder}
                    onChange={(e) => setCustomCategory(e.target.value)}
                  />
                </Field>
              )}
              <Field label={tbu.region}>
                <Input
                  value={region}
                  placeholder={tbu.regionPlaceholder}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </Field>
              <Field label={tbu.provider}>
                <Input
                  value={provider}
                  placeholder={displayName || tbu.namePlaceholder}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </Field>
              <Field label={tbu.compat}>
                <Input
                  value={compat}
                  placeholder={tbu.compatPlaceholder}
                  onChange={(e) => setCompat(e.target.value)}
                />
              </Field>
            </Grid>
          </Section>

          {/* step 1 — detection */}
          <Section title={tbu.step1}>
            <p className={cn(hint, "mb-2.5")}>{tbu.step1Help}</p>
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
              {tbu.addSignature}
            </Button>
            <div className="mt-4">
              <p
                className={cn(hint, "mb-2.5")}
                dangerouslySetInnerHTML={{ __html: tbu.exclusionHelp }}
              />
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
                {tbu.addExclusion}
              </Button>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <StatusLine
                ok={matchesCurrent}
                text={matchesCurrent ? tbu.matches : tbu.noMatch}
              />
              <StatusLine
                ok={collisionList.length === 0}
                text={
                  collisionList.length === 0
                    ? tbu.noConflicts
                    : interpolate(
                        collisionList.length === 1
                          ? tbu.conflictsOne
                          : tbu.conflictsOther,
                        { n: collisionList.length },
                      )
                }
              />
            </div>
          </Section>

          {/* step 2 — extraction */}
          <Section
            title={tbu.step2}
            dim={!gatePassed}
            right={
              gatePassed ? (
                <div className="flex gap-1.5">
                  <Tab active={mode === "structured"} onClick={toStructured}>
                    {tbu.structured}
                  </Tab>
                  <Tab active={mode === "json"} onClick={toJson}>
                    {tbu.advancedJson}
                  </Tab>
                </div>
              ) : undefined
            }
          >
            {!gatePassed ? (
              <p className={cn(hint, "mb-2.5")}>{tbu.finishStep1}</p>
            ) : mode === "json" ? (
              <>
                <p className={cn(hint, "mb-2")}>{tbu.jsonHelp}</p>
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
                <SubHead label={tbu.extractLabel} sub={tbu.extractSub} />
                {config.captures.length === 0 && (
                  <p className={cn(hint, "mb-2.5")}>{tbu.nothingCaptured}</p>
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
                  {tbu.addCapture}
                </Button>

                <div className="h-4" />
                <SubHead label={tbu.deriveLabel} sub={tbu.deriveSub} />
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
                  {tbu.addDerived}
                </Button>

                <div className="h-4" />
                <SubHead label={tbu.rolesLabel} sub={tbu.rolesSub} />
                {ROLE_KEYS.map((key) => (
                  <RoleCard
                    key={key}
                    label={tbu.roles[key]}
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
                <SubHead label={tbu.customLabel} sub={tbu.customSub} />
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
                  {tbu.addCustom}
                </Button>
              </>
            )}

            {/* preview / review */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Label>
                  {mode === "structured" && structResult?.issues.length
                    ? tbu.needsReview
                    : tbu.preview}
                </Label>
                {previewOk && <ValueChip value={tbu.resolves} size="sm" />}
              </div>
              {mode === "structured" ? (
                structResult ? (
                  structResult.issues.length ? (
                    <ReviewBox issues={structResult.issues} />
                  ) : (
                    <StructuredPreview result={structResult} />
                  )
                ) : (
                  <p className={cn(hint, "mb-2.5")}>{tbu.defineFields}</p>
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
            {/* Always clickable (unless a save is in flight) so finish() can
                surface what's missing and scroll to the offending field. */}
            <Button
              variant="solid"
              size="lg"
              disabled={
                createParser.isPending ||
                updateParser.isPending ||
                reparse.isPending
              }
              onClick={finish}
            >
              {!editingOwn
                ? tbu.forkSave
                : existingId
                  ? tbu.saveReparse
                  : tbu.finish}
            </Button>
            {canFinish && slug && usage.data && usage.data.count > 0 && (
              <span className={hint}>
                {interpolate(
                  usage.data.count === 1
                    ? tbu.savingRerunOne
                    : tbu.savingRerunOther,
                  { n: usage.data.count },
                )}
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
