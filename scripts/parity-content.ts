#!/usr/bin/env bun
/**
 * Rendered-content parity between two builds — or two deployments — of the site.
 *
 * It answers one question: *does the page a reader sees still look the same?*
 * It compares what a reader gets — visible text, heading ids, JSON-LD, the
 * indexable head — and deliberately not the markup, so a refactor is free to
 * restructure the HTML and still has to prove it changed nothing that shows.
 *
 * ── Refactoring a figure component (the offline workflow) ──────────────────
 *
 *   bun run build
 *   bun scripts/parity-content.ts capture --build --out .parity/before
 *   # …refactor…
 *   bun run build
 *   bun scripts/parity-content.ts capture --build --out .parity/after
 *   bun scripts/parity-content.ts compare --before .parity/before --after .parity/after
 *
 * `--build` reads the prerendered HTML straight out of `.next/server/app`, so
 * neither side needs a server. Exit code is 1 if any page differs, so it gates
 * a commit as well as a release. The compare also prints an ISR ledger: how
 * many 8 KB units of stored output each page gained or lost, which is the cost
 * a markup change keeps paying on every later revalidation.
 *
 * Clear `.next` between a database change and a build. `unstable_cache` entries
 * persist across builds, and a stale one is how a synced database produced a
 * sitemap crash that named nothing.
 *
 * ── Its original job, kept ─────────────────────────────────────────────────
 *
 * The migration this was written for: *does the page still look the same after
 * the content moved into the database?*
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
const CONTENT_PREFIXES = [
  "/guias",
  "/estadisticas",
  "/investigaciones",
  "/noticias",
];

/** Fetched a few at a time: the "before" side is production. */
const CONCURRENCY = 6;

/** Where `next build` leaves the prerendered HTML. Reading it directly is what
 * makes a refactor check offline: no server to start, no port to pick, and the
 * bytes are the ones ISR would store rather than a re-render of them. */
const BUILD_ROOT = ".next/server/app";

/** The build writes the canonical (Spanish) tree under `es/`; `/en/…` paths
 * live under `en/` and are filtered out with the rest of the alternates. */
const buildFileFor = (p: string): string =>
  path.join(BUILD_ROOT, "es", `${p.replace(/^\//, "")}.html`);

/** Strip the two things that differ between builds of identical source: the
 * build id, and the content-hashed asset filenames. Both are embedded in the
 * RSC flight payload as well as in `<script src>`, and both change length, so
 * without this every page shows a few dozen bytes of movement on every rebuild
 * and the ISR ledger has a noise floor it cannot distinguish from a real
 * regression. The aspect comparison never saw them — it strips `<script>` — so
 * this only makes the byte side as honest as the text side already was. */
function deAsset(html: string, buildId: string | null): string {
  const withoutAssets = html
    .replace(
      /\/_next\/static\/chunks\/[^"'\\\s)]+?\.js/g,
      "/_next/static/chunks/ASSET.js",
    )
    .replace(
      /\/_next\/static\/css\/[^"'\\\s)]+?\.css/g,
      "/_next/static/css/ASSET.css",
    )
    .replace(
      /\/_next\/static\/media\/[^"'\\\s)]+?\.(\w+)/g,
      "/_next/static/media/ASSET.$1",
    );
  return buildId
    ? withoutAssets.split(buildId).join("BUILD_ID")
    : withoutAssets;
}

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
  const fromBuild = has("build");
  const origin = (flag("origin") ?? "").replace(/\/$/, "");
  const out = flag("out") ?? ".parity/before";
  if (!fromBuild && !origin) {
    throw new Error("capture needs --origin https://factura.uno, or --build");
  }

  const sitemapXml = fromBuild
    ? readFileSync(path.join(BUILD_ROOT, "sitemap.xml.body"), "utf8")
    : await (async () => {
        const response = await get(`${origin}/sitemap.xml`);
        if (response.status !== 200) {
          throw new Error(`${origin}/sitemap.xml returned ${response.status}`);
        }
        return response.body;
      })();

  const paths = contentPaths(sitemapXml);
  if (paths.length === 0) throw new Error("sitemap listed no content paths");

  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "sitemap.xml"), sitemapXml);

  const source = fromBuild ? BUILD_ROOT : origin;
  const buildId = fromBuild
    ? readFileSync(".next/BUILD_ID", "utf8").trim()
    : null;
  console.log(`Capturing ${paths.length} pages from ${source} → ${out}`);
  let failed = 0;

  // Byte sizes are recorded at capture time, from the bytes as they were
  // stored. `compare` reports the delta in the 8 KB units the ISR bill is
  // counted in — a refactor that changes markup pays for that on every
  // subsequent rewrite of the page, so it is worth seeing next to the diff.
  const bytes: Record<string, number> = {};

  await pooled(paths, async (p) => {
    let body: string;
    if (fromBuild) {
      try {
        body = readFileSync(buildFileFor(p), "utf8");
      } catch {
        failed++;
        console.error(`  missing from build: ${p}`);
        return;
      }
    } else {
      const page = await get(`${origin}${p}`);
      if (page.status !== 200) {
        failed++;
        console.error(`  ${page.status} ${p}`);
        return;
      }
      body = page.body;
    }
    const stable = deAsset(body, buildId);
    bytes[p] = Buffer.byteLength(stable);
    writeFileSync(path.join(out, fileFor(p)), stable);
  });

  writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify({ origin: source, capturedAt: new Date().toISOString(), paths, bytes }, null, 2)}\n`,
  );
  console.log(
    `Captured ${paths.length - failed} pages${failed ? `, ${failed} failed` : ""}.`,
  );
  if (failed) process.exit(1);
}

// ── compare ─────────────────────────────────────────────────────────────────

type Manifest = {
  origin: string;
  capturedAt: string;
  paths: string[];
  bytes?: Record<string, number>;
};

async function compare(): Promise<void> {
  const dir = flag("before") ?? ".parity/before";
  const after = (flag("after") ?? "").replace(/\/$/, "");
  const only = flag("only");
  const context = Number(flag("context") ?? 2);
  if (!after) {
    throw new Error("compare needs --after <url> or --after <captured dir>");
  }

  // `--after` is either a URL or a second capture directory. A directory is
  // what a refactor uses: two `capture --build` runs compare offline, with no
  // server on either side.
  const afterIsDir = !/^https?:\/\//.test(after);
  const afterManifest: Manifest | null = afterIsDir
    ? (JSON.parse(
        readFileSync(path.join(after, "manifest.json"), "utf8"),
      ) as Manifest)
    : null;

  const manifest = JSON.parse(
    readFileSync(path.join(dir, "manifest.json"), "utf8"),
  ) as Manifest;
  const captured = new Set(readdirSync(dir));
  const paths = manifest.paths.filter(
    (p) => captured.has(fileFor(p)) && (!only || p.includes(only)),
  );

  console.log(
    `Comparing ${paths.length} pages\n  before: ${manifest.origin} (captured ${manifest.capturedAt})\n  after:  ${afterManifest ? `${afterManifest.origin} (captured ${afterManifest.capturedAt})` : after}\n`,
  );

  let differing = 0;
  let missing = 0;

  const results = await pooled(paths, async (p) => {
    const before = aspectsOf(readFileSync(path.join(dir, fileFor(p)), "utf8"));
    let body: string;
    if (afterIsDir) {
      try {
        body = readFileSync(path.join(after, fileFor(p)), "utf8");
      } catch {
        return { path: p, status: 404, lines: [] as string[] };
      }
    } else {
      const page = await get(`${after}${p}`);
      if (page.status !== 200) {
        return { path: p, status: page.status, lines: [] as string[] };
      }
      body = page.body;
    }
    return {
      path: p,
      status: 200,
      lines: compareAspects(before, aspectsOf(body), context),
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

  // The reverse direction: a page the new build serves that the capture did not.
  const afterSitemapXml = afterIsDir
    ? readFileSync(path.join(after, "sitemap.xml"), "utf8")
    : await get(`${after}/sitemap.xml`).then((r) =>
        r.status === 200 ? r.body : "",
      );
  const added = afterSitemapXml
    ? contentPaths(afterSitemapXml).filter((p) => !manifest.paths.includes(p))
    : [];
  for (const p of added)
    console.log(`NEW   ${p}  (not in the captured sitemap)`);

  // ── the ISR ledger ────────────────────────────────────────────────────────
  //
  // Only when both sides recorded sizes, which means both came from a build.
  // The unit is what the bill counts: 8 KB of changed output per rewrite. A
  // refactor that leaves the reader's page identical can still make every one
  // of these pages more expensive to revalidate forever after, and that is not
  // visible in a text diff.
  if (manifest.bytes && afterManifest?.bytes) {
    const UNIT = 8 * 1024;
    const rows = paths
      .map((p) => ({
        path: p,
        before: manifest.bytes![p] ?? 0,
        after: afterManifest.bytes![p] ?? 0,
      }))
      .filter((r) => r.before && r.after)
      .map((r) => ({ ...r, delta: r.after - r.before }));

    const moved = rows
      .filter((r) => r.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const units = (n: number) => Math.ceil(n / UNIT);
    const totalBefore = rows.reduce((s, r) => s + r.before, 0);
    const totalAfter = rows.reduce((s, r) => s + r.after, 0);
    const unitsBefore = rows.reduce((s, r) => s + units(r.before), 0);
    const unitsAfter = rows.reduce((s, r) => s + units(r.after), 0);

    console.log(
      `\nStored output (${rows.length} pages with sizes on both sides)`,
    );
    console.log(
      `  bytes  ${totalBefore.toLocaleString()} → ${totalAfter.toLocaleString()}` +
        `  (${totalAfter - totalBefore >= 0 ? "+" : ""}${(totalAfter - totalBefore).toLocaleString()})`,
    );
    console.log(
      `  8 KB units per full rewrite  ${unitsBefore} → ${unitsAfter}` +
        `  (${unitsAfter - unitsBefore >= 0 ? "+" : ""}${unitsAfter - unitsBefore})`,
    );
    for (const r of moved.slice(0, 10)) {
      const sign = r.delta >= 0 ? "+" : "";
      console.log(
        `    ${sign}${r.delta.toLocaleString().padStart(9)} B  ${sign}${units(r.after) - units(r.before)} u  ${r.path}`,
      );
    }
    if (moved.length > 10) {
      console.log(`    … ${moved.length - 10} more pages changed size`);
    }
    if (moved.length === 0) console.log("    no page changed size");
    console.log(
      "  Per-page rows have a small floor; the two totals above do not.\n" +
        "  Turbopack includes or omits a client-module reference row depending\n" +
        "  on how it grouped chunks — ±43 B, on a handful of pages, and it\n" +
        "  cancels out across the site. Measured on two builds of identical\n" +
        "  source: 5 of 117 pages moved, totals +0 B and +0 units. So read a\n" +
        "  ±43 or ±86 B row on a page you did not touch as noise, and read any\n" +
        "  movement in the totals as real. The text diff has no floor at all —\n" +
        "  it is the gate; this is the bill.",
    );
  }

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
  bun scripts/parity-content.ts capture --build [--out <dir>]
  bun scripts/parity-content.ts capture --origin <url> [--out <dir>]
  bun scripts/parity-content.ts compare --before <dir> --after <url|dir> [--only <substr>] [--context <n>]`;

if (has("help") || (mode !== "capture" && mode !== "compare")) {
  console.log(usage);
  process.exit(mode ? 1 : 0);
}

await (mode === "capture" ? capture() : compare());
