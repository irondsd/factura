"use client";

import posthog from "posthog-js";
import type { Tier } from "@/lib/probar";

// The /probar funnel, in one place.
//
// WHY CLIENT-SIDE. Every step before "sign in" happens to an anonymous
// visitor, and the only id that survives into their account is posthog-js's
// own `distinct_id` — `identify()` merges that anonymous person into the
// signed-in one, which is what makes "dropped a bill, then signed up" a single
// joinable journey. Server-side capture would have to invent a distinct id
// (submission id, user id) and every one of those choices lands on a different
// person than the browser's. So: journey here, counts in the database.
//
// The tradeoff, stated plainly: a blocked client reports nothing. That's
// mitigated by the /ingest reverse-proxy in next.config.ts, and
// `bill_submissions` remains the ground truth for how many bills were actually
// dropped and how many parsed — this is for behaviour, not accounting.
//
// WHAT MUST NEVER BE SENT. These are strangers' utility bills. No file names
// (they routinely contain an account number or a person's name), no extracted
// values — no `identity`, no amount, no address, no raw text. Vendor slug,
// parser slug and tier describe OUR parsers, not the visitor, so they're fine.

/** Where a batch of files came from — the top of the funnel splits here. */
export type DropSource = "drop" | "browse" | "sample";

export type ResultOutcome =
  | "parsed"
  | "parse_failed"
  | "unrecognized"
  | "no_text"
  | "error";

export function fileSelected(props: {
  count: number;
  source: DropSource;
  keepFile: boolean;
}) {
  posthog.capture("probar_files_selected", {
    count: props.count,
    source: props.source,
    keep_file: props.keepFile,
  });
}

/** Rejected in the browser, before any request. Separates "tried and we said
 * no" from "never tried" — the two look identical in server logs. */
export function fileRejected(props: {
  reason: "not_pdf" | "over_drop_limit";
  count: number;
}) {
  posthog.capture("probar_file_rejected", {
    reason: props.reason,
    count: props.count,
  });
}

/** The core event: one per file, once its cascade settles. Everything about
 * "do bills get recognized, by which tier, and which vendors keep failing"
 * comes from this one. */
export function fileResult(props: {
  outcome: ResultOutcome;
  source: DropSource;
  tier?: Tier | null;
  parserSlug?: string | null;
  vendorSlug?: string | null;
  detectScore?: number | null;
  tiersTried: number;
  pageCount?: number;
  charCount?: number;
  truncated?: boolean;
  durationMs: number;
  /** Why it failed before parsing could even start. */
  errorReason?:
    | "too_large"
    | "rate_limited"
    | "upload_failed"
    | "session_lost"
    | null;
}) {
  posthog.capture("probar_file_result", {
    outcome: props.outcome,
    source: props.source,
    matched_tier: props.tier ?? null,
    parser_slug: props.parserSlug ?? null,
    vendor_slug: props.vendorSlug ?? null,
    detect_score: props.detectScore ?? null,
    tiers_tried: props.tiersTried,
    page_count: props.pageCount ?? null,
    char_count: props.charCount ?? null,
    truncated: props.truncated ?? false,
    duration_ms: props.durationMs,
    error_reason: props.errorReason ?? null,
  });
}

/** Does the retention promise actually get exercised? Only fires on a real
 * change, so the default-on state isn't reported as a choice. */
export function keepFileToggled(keepFile: boolean) {
  posthog.capture("probar_keep_file_toggled", { keep_file: keepFile });
}

/** Someone cared enough about an unsupported bill to leave an address. The
 * address itself never leaves the form. */
export function notifyRequested(outcome: ResultOutcome) {
  posthog.capture("probar_notify_requested", { outcome });
}

export function saveCtaShown(billCount: number) {
  posthog.capture("probar_save_cta_shown", { bill_count: billCount });
}

export function saveCtaClicked(billCount: number) {
  posthog.capture("probar_save_cta_clicked", { bill_count: billCount });
}

/** Fired from /app after sign-in, on the identified person — the far end of the
 * funnel that began anonymously on /probar. */
export function claimCompleted(props: {
  total: number;
  claimed: number;
  duplicate: number;
  already: number;
}) {
  posthog.capture("probar_claim_completed", {
    total: props.total,
    claimed: props.claimed,
    duplicate: props.duplicate,
    already: props.already,
  });
}

export type SessionStats = {
  filesSubmitted: number;
  parsed: number;
  parseFailed: number;
  unrecognized: number;
  noText: number;
  errors: number;
  saveCtaShown: boolean;
  saveCtaClicked: boolean;
  notifyRequested: boolean;
  secondsOnPage: number;
};

/** The two derived flags the dashboards actually get sliced by. Pure and
 * unit-tested, because getting either backwards produces a confident,
 * wrong answer to "are we losing people, and at which step" — and nothing
 * downstream would reveal it. */
export function abandonmentFlags(s: SessionStats): {
  abandoned_after_success: boolean;
  abandoned_after_failure: boolean;
} {
  return {
    // Tried it, we read the bill correctly, walked away without saving.
    // A product problem: the offer isn't landing.
    abandoned_after_success: s.parsed > 0 && !s.saveCtaClicked,
    // Tried it, we couldn't read anything, walked away without even asking to
    // be told when we can. A coverage problem: the vendor isn't supported and
    // they didn't care enough to wait. Requires at least one submission, so a
    // pure bounce never counts as a failure.
    abandoned_after_failure:
      s.filesSubmitted > 0 && s.parsed === 0 && !s.notifyRequested,
  };
}

/** What the visit added up to, sent as the page goes away.
 *
 * This is the "saw it wasn't supported and left" measurement: leaving isn't an
 * event, so no funnel step can express it — only a summary can.
 *
 * Sent on `visibilitychange → hidden` rather than `beforeunload`, which mobile
 * browsers routinely skip, and over `sendBeacon` so it survives the teardown. */
export function sessionSummary(s: SessionStats) {
  posthog.capture(
    "probar_session_summary",
    {
      files_submitted: s.filesSubmitted,
      parsed: s.parsed,
      parse_failed: s.parseFailed,
      unrecognized: s.unrecognized,
      no_text: s.noText,
      errors: s.errors,
      save_cta_shown: s.saveCtaShown,
      save_cta_clicked: s.saveCtaClicked,
      notify_requested: s.notifyRequested,
      seconds_on_page: s.secondsOnPage,
      ...abandonmentFlags(s),
    },
    { transport: "sendBeacon" },
  );
}
