#!/usr/bin/env bun
/**
 * Rendered-content parity between two deployments of the site.
 *
 * The question this answers is the one the importer cannot: *does the page a
 * reader sees still look the same after the content moved into the database?*
 *
 * The importer's own check (`sameSource`, which a second `--dry-run` reports as
 * "0 insert/update") compares the source fields against the stored fields — but
 * both sides of that comparison are produced by the same extractor, so it
 * agrees with itself by construction. That is exactly how a stray `;` left over
 * from `export const meta = { … };` ended up rendering as a paragraph at the top
 * of all 61 migrated pages while every field comparison reported "unchanged".
 *
 * This compares against something the new code had no hand in: the HTML the
 * old, filesystem-backed deployment actually served.
 *
 *   1. Capture, while production still serves from `.mdx`:
 *
 *        bun scripts/parity-content.ts capture \
 *          --origin https://factura.uno --out .parity/before
 *
 *      That window closes at the merge. There is no way to reconstruct it
 *      afterwards, so capture before cutting over.
 *
 *   2. Compare, against a build running on production data:
 *
 *        bun scripts/parity-content.ts compare \
 *          --before .parity/before --after http://localhost:4100
 *
 *      Exit code is 1 if any page differs, so it can gate a release.
 *
 * The URL list comes from the *captured* sitemap rather than from the
 * repository: "every URL production serves today" is the property being
 * preserved, and reading it from the wire keeps this script working after the
 * `.mdx` sources are deleted.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── options ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const mode = argv[0];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name: string): boolean => argv.includes(`--${name}`);

/** Sections whose pages this compares. Index pages and category hubs come along
 * because they are in the sitemap; everything outside content is skipped, since
 * the app pages have nothing to do with the migration. */
const CONTENT_PREFIXES = ["/guias", "/estadisticas", "/investigaciones"];

/** Fetched a few at a time: the "before" side is production. */
const CONCURRENCY = 6;

// ── html → comparable aspects ───────────────────────────────────────────────

/** The part of the page the content actually occupies. Falls back outward so
 * an index page (no `<article>`) still compares its own body rather than
 * nothing. */
function contentRegion(html: string): string {
  for (const tag of ["article", "main", "body"]) {
    const open = html.indexOf(`<${tag}`);
    const close = html.lastIndexOf(`</${tag}>`);
    if (open !== -1 && close > open) return html.slice(open, close);
  }
  return html;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
};

const decode = (text: string): string =>
  text
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** What a reader sees, one block per line.
 *
 * Applied identically to both sides, so nothing here can invent a difference —
 * it can only fail to *show* one, which is why the structural aspects below are
 * compared separately rather than folded into this. */
function visibleText(html: string): string[] {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "")
      // Block boundaries become line breaks so a diff points at a paragraph
      // rather than at one enormous line.
      .replace(/<\/(p|h[1-6]|li|div|tr|figcaption|blockquote|pre|td)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");
}

/** Heading anchors, which the table of contents links to. A page whose prose is
 * identical but whose heading ids moved has a broken contents column. */
function headingIds(html: string): string[] {
  return [...html.matchAll(/<h([2-6])[^>]*\bid="([^"]+)"/gi)].map(
    (m) => `h${m[1]}#${m[2]}`,
  );
}

const head = (html: string, pattern: RegExp): string =>
  pattern.exec(html)?.[1]?.trim() ?? "";

/** Structured data, compared as data rather than as text.
 *
 * Two normalisations, both of which are *correct* rather than lenient:
 * timestamps are compared as instants because `timestamptz` returns the same
 * moment with a different offset ("…-03:00" becomes "…Z"), and the `?v=` stamp
 * on a social-card URL is a cache-buster derived from that timestamp's date, so
 * it can legitimately shift by a day without anything visible changing. */
function jsonLd(html: string): string[] {
  return [
    ...html.matchAll(
      /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
    .map((m) => {
      try {
        return stableJson(normalise(JSON.parse(decode(m[1]))));
      } catch {
        return `<unparseable json-ld>`;
      }
    })
    .sort();
}

function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        normalise(v),
      ]),
    );
  }
  if (typeof value === "string") {
    const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
      ? Date.parse(value)
      : NaN;
    if (!Number.isNaN(instant)) return `@${instant}`;
    return value.replace(/([?&]v=)\d{8}\b/g, "$1<stamp>");
  }
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

type Aspects = {
  title: string;
  description: string;
  robots: string;
  canonical: string;
  jsonLd: string[];
  headings: string[];
  text: string[];
};

function aspectsOf(html: string): Aspects {
  const region = contentRegion(html);
  return {
    title: head(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: head(
      html,
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/i,
    ),
    robots: head(html, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i),
    canonical: head(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i),
    jsonLd: jsonLd(html),
    headings: headingIds(region),
    text: visibleText(region),
  };
}

// ── diffing ─────────────────────────────────────────────────────────────────

/** The differing middle of two line arrays, with the shared head and tail
 * trimmed off. Not a real diff algorithm, deliberately: an inserted or removed
 * block — which is what a content regression looks like — falls straight out of
 * prefix/suffix trimming, and the output stays readable. */
function differingWindow(
  before: string[],
  after: string[],
  context: number,
): { from: number; before: string[]; after: string[] } | null {
  let head = 0;
  while (
    head < before.length &&
    head < after.length &&
    before[head] === after[head]
  ) {
    head++;
  }
  if (head === before.length && head === after.length) return null;

  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }

  const from = Math.max(0, head - context);
  return {
    from,
    before: before.slice(from, before.length - tail + context),
    after: after.slice(from, after.length - tail + context),
  };
}

const MAX_LINES = 12;

function report(
  label: string,
  before: string[],
  after: string[],
  context: number,
): string[] {
  const window = differingWindow(before, after, context);
  if (!window) return [];
  const show = (lines: string[], marker: string) =>
    lines
      .slice(0, MAX_LINES)
      .map((line, i) => `      ${marker} ${window.from + i + 1}| ${line}`)
      .concat(
        lines.length > MAX_LINES
          ? [`      ${marker} … ${lines.length - MAX_LINES} more`]
          : [],
      );
  return [
    `    ${label}:`,
    ...show(window.before, "-"),
    ...show(window.after, "+"),
  ];
}

function compareAspects(
  before: Aspects,
  after: Aspects,
  context: number,
): string[] {
  const lines: string[] = [];
  for (const field of [
    "title",
    "description",
    "robots",
    "canonical",
  ] as const) {
    if (before[field] !== after[field]) {
      lines.push(
        `    ${field}:`,
        `      - ${before[field] || "(none)"}`,
        `      + ${after[field] || "(none)"}`,
      );
    }
  }
  lines.push(...report("json-ld", before.jsonLd, after.jsonLd, 0));
  lines.push(...report("headings", before.headings, after.headings, 1));
  lines.push(...report("text", before.text, after.text, context));
  return lines;
}

// ── fetching ────────────────────────────────────────────────────────────────

async function get(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "factura-parity/1" },
    redirect: "follow",
  });
  return { status: response.status, body: await response.text() };
}

/** Run `work` over `items`, a few at a time. */
async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

/** Content paths from a sitemap, in a stable order.
 *
 * The path, not the URL: a sitemap declares canonical `factura.uno` addresses
 * whatever origin happens to be serving it, so matching on the fetch origin
 * would find nothing when the origin is a local build. */
function contentPaths(sitemap: string): string[] {
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .flatMap((url) => {
      try {
        return [new URL(url).pathname];
      } catch {
        return [];
      }
    })
    // Spanish is the canonical locale and the only one guides exist in; the
    // /en/ alternates of shared pages are not part of this migration.
    .filter((p) => !p.startsWith("/en/"))
    .filter((p) => CONTENT_PREFIXES.some((prefix) => p.startsWith(prefix)));
  return [...new Set(paths)].sort();
}

const fileFor = (p: string): string =>
  `${p.replace(/^\//, "").replace(/\//g, "__") || "index"}.html`;

// ── capture ─────────────────────────────────────────────────────────────────

async function capture(): Promise<void> {
  const origin = (flag("origin") ?? "").replace(/\/$/, "");
  const out = flag("out") ?? ".parity/before";
  if (!origin) throw new Error("capture needs --origin https://factura.uno");

  const sitemap = await get(`${origin}/sitemap.xml`);
  if (sitemap.status !== 200) {
    throw new Error(`${origin}/sitemap.xml returned ${sitemap.status}`);
  }
  const paths = contentPaths(sitemap.body);
  if (paths.length === 0) throw new Error("sitemap listed no content paths");

  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "sitemap.xml"), sitemap.body);

  console.log(`Capturing ${paths.length} pages from ${origin} → ${out}`);
  let failed = 0;
  await pooled(paths, async (p) => {
    const page = await get(`${origin}${p}`);
    if (page.status !== 200) {
      failed++;
      console.error(`  ${page.status} ${p}`);
      return;
    }
    writeFileSync(path.join(out, fileFor(p)), page.body);
  });

  writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify({ origin, capturedAt: new Date().toISOString(), paths }, null, 2)}\n`,
  );
  console.log(
    `Captured ${paths.length - failed} pages${failed ? `, ${failed} failed` : ""}.`,
  );
  if (failed) process.exit(1);
}

// ── compare ─────────────────────────────────────────────────────────────────

type Manifest = { origin: string; capturedAt: string; paths: string[] };

async function compare(): Promise<void> {
  const dir = flag("before") ?? ".parity/before";
  const after = (flag("after") ?? "").replace(/\/$/, "");
  const only = flag("only");
  const context = Number(flag("context") ?? 2);
  if (!after) throw new Error("compare needs --after http://localhost:4100");

  const manifest = JSON.parse(
    readFileSync(path.join(dir, "manifest.json"), "utf8"),
  ) as Manifest;
  const captured = new Set(readdirSync(dir));
  const paths = manifest.paths.filter(
    (p) => captured.has(fileFor(p)) && (!only || p.includes(only)),
  );

  console.log(
    `Comparing ${paths.length} pages\n  before: ${manifest.origin} (captured ${manifest.capturedAt})\n  after:  ${after}\n`,
  );

  let differing = 0;
  let missing = 0;

  const results = await pooled(paths, async (p) => {
    const before = aspectsOf(readFileSync(path.join(dir, fileFor(p)), "utf8"));
    const page = await get(`${after}${p}`);
    if (page.status !== 200) {
      return { path: p, status: page.status, lines: [] as string[] };
    }
    return {
      path: p,
      status: 200,
      lines: compareAspects(before, aspectsOf(page.body), context),
    };
  });

  for (const result of results) {
    if (result.status !== 200) {
      missing++;
      console.log(`GONE  ${result.path}  → HTTP ${result.status}`);
      continue;
    }
    if (result.lines.length === 0) continue;
    differing++;
    console.log(`DIFF  ${result.path}`);
    for (const line of result.lines) console.log(line);
    console.log("");
  }

  // The reverse direction: a page the new build serves that production did not.
  const afterSitemap = await get(`${after}/sitemap.xml`);
  const added =
    afterSitemap.status === 200
      ? contentPaths(afterSitemap.body).filter(
          (p) => !manifest.paths.includes(p),
        )
      : [];
  for (const p of added)
    console.log(`NEW   ${p}  (not in the captured sitemap)`);

  const identical = paths.length - differing - missing;
  console.log(
    `\n${paths.length} compared · ${identical} identical · ${differing} differing · ${missing} missing${added.length ? ` · ${added.length} new` : ""}`,
  );
  console.log(
    "Timestamps are compared as instants and social-card ?v= stamps are ignored:\n" +
      "a `timestamptz` round trip re-spells the same moment, and nothing visible depends on either.",
  );

  if (differing || missing) process.exit(1);
}

// ── entry ───────────────────────────────────────────────────────────────────

const usage = `Usage:
  bun scripts/parity-content.ts capture --origin <url> [--out <dir>]
  bun scripts/parity-content.ts compare --before <dir> --after <url> [--only <substr>] [--context <n>]`;

if (has("help") || (mode !== "capture" && mode !== "compare")) {
  console.log(usage);
  process.exit(mode ? 1 : 0);
}

await (mode === "capture" ? capture() : compare());
