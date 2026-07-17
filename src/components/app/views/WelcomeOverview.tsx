"use client";

import { useRef } from "react";
import { useBillIngest } from "@/components/BillIngestProvider";
import { ChartCard, Display, Eyebrow } from "@/components/charts";
import { useI18n } from "@/i18n/I18nProvider";

/** First-run Overview for a signed-in user with no bills yet. A welcome message
 * and a click-to-upload drop zone sit above a dimmed, non-interactive preview of
 * the real Overview charts, so the empty dashboard still shows what it's for.
 * Dropping a PDF anywhere is handled globally by <DropOverlay>; the zone here is
 * the click-to-browse affordance (and the visual invitation). */
// Dot spacing/color for the perforated-paper backdrop behind the intro.
const DOTS =
  "[background-image:radial-gradient(color-mix(in_srgb,var(--line)_75%,transparent)_1px,transparent_1px)] [background-size:20px_20px]";

export function WelcomeOverview() {
  const { t } = useI18n();
  const tw = t.overview.welcome;
  const to = t.overview;
  const { handleFiles, busy } = useBillIngest();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const steps = [
    { tag: tw.step1Tag, body: tw.step1Body },
    { tag: tw.step2Tag, body: tw.step2Body },
    { tag: tw.step3Tag, body: tw.step3Body },
  ];

  return (
    <div className="mx-auto max-w-[64rem] px-5 pt-8 pb-20">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          // Allow re-selecting the same file after the picker closes.
          e.target.value = "";
        }}
      />

      {/* Perforated-paper intro: hero, drop zone, and the three steps all sit on
          the same dotted backdrop. Bleeds to the container edge via -mx-5. */}
      <div className={`-mx-5 px-5 pb-2 ${DOTS}`}>
        {/* hero */}
        <Display size={44} className="block">
          {tw.title}
        </Display>
        <p className="mt-4 max-w-[80ch] font-mono text-[13px] leading-[1.6] text-muted">
          {tw.body}
        </p>

        {/* drop zone — a single hover/click target: solid fill over the dots,
            thick rounded dashed border. The inner "browse" box is a styled span
            (not a nested button) so the whole card stays one control. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="group mt-7 flex w-full flex-col items-center gap-4 border-2 border-dashed border-line bg-card px-6 py-14 text-center transition-colors hover:border-accent hover:bg-[var(--accent-soft)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 md:py-16"
        >
          <svg
            width="20"
            height="30"
            viewBox="0 0 20 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted transition-colors group-hover:text-accent"
            aria-hidden="true"
          >
            <path d="M10 2v24" />
            <path d="M3 19l7 7 7-7" />
          </svg>
          <span className="font-display text-3xl font-semibold tracking-tight text-ink">
            {busy ? t.app.loading : tw.dropTitle}
          </span>
          <span className="max-w-[44ch] font-mono text-[13px] leading-[1.6] text-muted">
            {tw.dropDesc}
          </span>
          <span className="border border-line px-[14px] py-[9px] font-mono text-micro uppercase tracking-label text-ink transition-colors group-hover:border-accent group-hover:text-accent">
            {tw.browse}
          </span>
          <span className="font-mono text-micro uppercase tracking-label text-muted">
            {tw.dropFootnote}
          </span>
        </button>

        {/* three steps */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="border border-line bg-card px-5 py-4">
              <p className="font-mono text-micro uppercase tracking-label text-accent">
                {s.tag}
              </p>
              <p className="mt-2.5 font-mono text-xs leading-[1.6] text-muted">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* dimmed, non-interactive preview of the real Overview */}
      <div className="mt-12">
        <Eyebrow className="mb-4">{tw.previewLabel}</Eyebrow>
        <div
          aria-hidden="true"
          className="pointer-events-none select-none opacity-55 blur-[1.5px]"
        >
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(280px,1fr)_minmax(360px,1.4fr)]">
            <ChartCard title={to.whereMoneyGoes} caption={to.last12Complete}>
              <GhostDonut />
            </ChartCard>
            <ChartCard title={to.monthlySpend} caption={to.stackedByVendor}>
              <GhostBars />
            </ChartCard>
          </div>
          <div className="mt-4">
            <ChartCard title={to.perVendorTrend} caption={to.spendLast12}>
              <GhostSparklines />
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  );
}

// Muted, on-brand vendor tones for the ghost shapes — earthy and calm so the
// preview reads as scaffolding, not real data.
const GHOST_TONES = [
  "var(--vendor-sage)",
  "var(--vendor-taupe)",
  "var(--vendor-amber)",
  "var(--vendor-slate-teal)",
  "var(--vendor-earth)",
];

/** Donut silhouette + a short skeleton legend, echoing <VendorShare>. */
function GhostDonut() {
  const stops = [0, 34, 58, 78, 100];
  const ring = `conic-gradient(${GHOST_TONES.map(
    (c, i) => `${c} ${stops[i]}%, ${c} ${stops[i + 1]}%`,
  ).join(", ")})`;
  return (
    <div className="flex flex-wrap items-center gap-4 md:flex-nowrap">
      <div
        className="relative h-[180px] w-[180px] flex-none rounded-full"
        style={{ background: ring }}
      >
        <div className="absolute inset-[30px] rounded-full bg-card" />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {GHOST_TONES.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-none" style={{ background: c }} />
            <span className="h-2 flex-1 rounded-sm bg-line" />
            <span className="h-2 w-7 rounded-sm bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Twelve months of stacked bars, each a fixed pseudo-random split — enough to
// suggest the real stacked chart without pretending to be data.
const GHOST_BAR_HEIGHTS = [46, 62, 54, 78, 70, 88, 60, 96, 74, 84, 66, 92];

/** Stacked-bar silhouette, echoing <SpendOverTime>. */
function GhostBars() {
  return (
    <div className="flex h-[210px] items-end gap-[6px] pt-2">
      {GHOST_BAR_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col justify-end"
          style={{ height: `${h}%` }}
        >
          <span
            className="w-full"
            style={{ height: "38%", background: GHOST_TONES[0] }}
          />
          <span
            className="w-full"
            style={{ height: "34%", background: GHOST_TONES[1] }}
          />
          <span
            className="w-full"
            style={{ height: "28%", background: GHOST_TONES[2] }}
          />
        </div>
      ))}
    </div>
  );
}

/** Grid of faint trend lines, echoing the per-vendor sparkline list. */
function GhostSparklines() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-t border-[color-mix(in_srgb,var(--line)_60%,transparent)] py-2"
        >
          <div className="flex-1">
            <div className="flex items-center gap-[7px]">
              <span
                className="h-2 w-2 flex-none"
                style={{ background: GHOST_TONES[i % GHOST_TONES.length] }}
              />
              <span className="h-2 w-20 rounded-sm bg-line" />
            </div>
            <span className="mt-2 block h-2 w-14 rounded-sm bg-line" />
          </div>
          <svg width="96" height="28" viewBox="0 0 96 28" aria-hidden="true">
            <polyline
              points="2,22 18,16 34,19 50,9 66,13 82,5 94,8"
              fill="none"
              stroke={GHOST_TONES[i % GHOST_TONES.length]}
              strokeWidth="1.5"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
