#!/usr/bin/env bun
/**
 * Audits the SEO markup of repository-owned pages submitted to Google.
 *
 * `validate:guides` checks the *source* of a guide. This checks the *output* of
 * a build, over the real serving path — proxy, rewrites and all — which is the
 * only place the interesting bugs show up: a canonical inherited from a parent
 * segment, an `openGraph` block that dropped `og:site_name` because Next merges
 * nested metadata by replacement, a sitemap URL that redirects or is noindexed,
 * two pages sharing a description.
 *
 * It starts `next start` against the existing production build, walks
 * `sitemap.xml`, and fails the run on repository-owned page errors. Normal runs
 * exclude CMS descendants; CI includes four code-owned fixture articles and a
 * location, then verifies each reaches the discovery surfaces appropriate to
 * its kind. Production content validation and content-level SEO belong to the
 * CMS.
 *
 * Run: `bun scripts/audit-seo.ts`  (or `bun run audit:seo`)
 * Set `AUDIT_BASE_URL` to audit a server that is already running (a preview
 * deploy, say) instead of starting one.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CI_CONTENT_FIXTURE_PATHS,
  CI_LOCATION_FIXTURE_PATHS,
} from "../src/content-system/repository/ci-fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

/** The production origin the build bakes into canonicals and the sitemap. Every
 * absolute URL is rewritten onto the local server before being fetched. */
const PROD_ORIGIN = "https://factura.uno";
const PORT = Number(process.env.AUDIT_PORT ?? 4173);
const usingCiFixtures = process.env.CI_CONTENT_FIXTURES === "1";

/** The identity page must not be indexable and never appears in the sitemap. */
const PRIVATE_PATHS = ["/login"];

/** The index at each prefix is repository-owned; its descendants are authored
 * in the CMS. `/guias/categoria/*` is also content-derived: the category exists
 * in the sitemap only when CMS content uses it. */
const CMS_CONTENT_PREFIXES = ["/guias/", "/estadisticas/", "/investigaciones/"];

function isRepositoryOwned(url: string): boolean {
  const pathname = new URL(url).pathname;
  return !CMS_CONTENT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** In fixture mode, prove the same article is discoverable through every
 * generated surface. This catches a build that renders a route successfully
 * but silently drops CMS content from search/crawler outputs. */
async function auditFixtureDiscovery(
  base: string,
  sitemapUrls: string[],
): Promise<string[]> {
  if (!usingCiFixtures) return [];

  const [feed, llms] = await Promise.all([
    fetch(`${base}/feed.xml`).then((response) => response.text()),
    fetch(`${base}/llms.txt`).then((response) => response.text()),
  ]);
  const sitemapPaths = new Set(sitemapUrls.map((url) => new URL(url).pathname));
  const errors: string[] = [];

  for (const pathname of CI_CONTENT_FIXTURE_PATHS) {
    if (!sitemapPaths.has(pathname)) {
      errors.push(`${pathname} is missing from sitemap.xml`);
    }
    const absolute = `${PROD_ORIGIN}${pathname}`;
    if (!feed.includes(absolute)) {
      errors.push(`${pathname} is missing from feed.xml`);
    }
    if (!llms.includes(absolute)) {
      errors.push(`${pathname} is missing from llms.txt`);
    }
  }

  // Location pages are indexes over the articles above, not publications of
  // their own: require them in the two discovery indexes, deliberately not in
  // the RSS feed.
  for (const pathname of CI_LOCATION_FIXTURE_PATHS) {
    if (!sitemapPaths.has(pathname)) {
      errors.push(`${pathname} is missing from sitemap.xml`);
    }
    const absolute = `${PROD_ORIGIN}${pathname}`;
    if (!llms.includes(absolute)) {
      errors.push(`${pathname} is missing from llms.txt`);
    }
  }
  return errors;
}

// Search results are cut off around here. Both are the rendered lengths, after
// any "— Factura" the title template appends.
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 200;

// ── tiny ANSI helpers (no deps), matching validate-guides.ts ────────────────
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (n: number, s: string) => (color ? `\x1b[${n}m${s}\x1b[0m` : s);
const red = (s: string) => c(31, s);
const yellow = (s: string) => c(33, s);
const green = (s: string) => c(32, s);
const dim = (s: string) => c(2, s);
const bold = (s: string) => c(1, s);

type Report = {
  url: string;
  errors: string[];
  warnings: string[];
  title?: string;
  description?: string;
};

// ── markup readers ──────────────────────────────────────────────────────────
// Regex rather than a parser: this reads a handful of well-formed tags out of
// Next's own output, and a DOM library would be a dependency for nothing.

const HEAD = (html: string) => html.slice(0, html.indexOf("</head>") + 7);

function titles(html: string): string[] {
  return [...HEAD(html).matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g)].map((m) =>
    decode(m[1].trim()),
  );
}

function meta(html: string, attr: "name" | "property", key: string) {
  const re = new RegExp(
    `<meta[^>]+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`,
    "g",
  );
  return [...HEAD(html).matchAll(re)]
    .map((m) => /content="([^"]*)"/.exec(m[0])?.[1])
    .filter((v): v is string => v !== undefined)
    .map(decode);
}

function links(html: string, rel: string) {
  const re = new RegExp(`<link[^>]+rel="${rel}"[^>]*>`, "g");
  return [...HEAD(html).matchAll(re)].map((m) => ({
    href: decode(/href="([^"]*)"/.exec(m[0])?.[1] ?? ""),
    hreflang: /hrefLang="([^"]*)"/i.exec(m[0])?.[1],
  }));
}

/** The handful of entities Next emits in attribute and title text. */
const decode = (s: string) =>
  s
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

// ── the checks ──────────────────────────────────────────────────────────────

async function auditPage(base: string, url: string): Promise<Report> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const report: Report = { url, errors, warnings };

  // `manual` so a redirect is a finding rather than something the fetch quietly
  // papers over: a sitemap that lists redirecting URLs wastes crawl budget and
  // muddles which URL is canonical.
  const res = await fetch(base + new URL(url).pathname, {
    redirect: "manual",
  });
  if (res.status !== 200) {
    errors.push(
      `expected 200, got ${res.status}${
        res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""
      }`,
    );
    return report;
  }

  const html = await res.text();

  // ── title ────────────────────────────────────────────────────────────────
  const found = titles(html);
  if (found.length === 0) errors.push("no <title>");
  else if (found.length > 1)
    errors.push(`${found.length} <title> tags — there must be exactly one`);
  const title = found[0];
  report.title = title;
  if (title !== undefined) {
    if (title.trim() === "") errors.push("<title> is empty");
    else if (title.length > TITLE_MAX) {
      errors.push(
        `<title> is ${title.length} chars — over ${TITLE_MAX} it's cut off in results: "${title}"`,
      );
    }
  }

  // ── description ──────────────────────────────────────────────────────────
  const description = meta(html, "name", "description")[0];
  report.description = description;
  if (!description) errors.push("no <meta name=description>");
  else if (description.length < DESCRIPTION_MIN)
    warnings.push(`description is only ${description.length} chars`);
  else if (description.length > DESCRIPTION_MAX)
    warnings.push(
      `description is ${description.length} chars (over ~${DESCRIPTION_MAX} it's truncated)`,
    );

  // ── canonical ────────────────────────────────────────────────────────────
  const canonical = links(html, "canonical").map((l) => l.href);
  if (canonical.length === 0) errors.push("no <link rel=canonical>");
  else if (canonical.length > 1)
    errors.push(`${canonical.length} canonicals — there must be exactly one`);
  else if (canonical[0] !== url) {
    // Every URL in the sitemap is a URL we're asking Google to index, so each
    // one has to name itself. A guide that canonicalizes elsewhere is dropped
    // from the sitemap upstream, in sitemap.ts.
    errors.push(`canonical points at ${canonical[0]}, not itself`);
  }

  // ── robots ───────────────────────────────────────────────────────────────
  const robots = meta(html, "name", "robots").join(" ");
  if (/noindex/i.test(robots)) {
    errors.push("is in the sitemap but says noindex");
  }

  // ── Open Graph ───────────────────────────────────────────────────────────
  // The set that broke before: a page spelling out its own `openGraph` replaces
  // the layout's whole block, so anything it forgets simply vanishes.
  for (const key of [
    "og:title",
    "og:description",
    "og:image",
    "og:site_name",
    "og:url",
    "og:type",
  ]) {
    if (meta(html, "property", key).length === 0) errors.push(`no ${key}`);
  }
  const ogUrl = meta(html, "property", "og:url")[0];
  if (ogUrl && canonical[0] && ogUrl !== canonical[0]) {
    errors.push(`og:url (${ogUrl}) disagrees with the canonical`);
  }
  if (meta(html, "name", "twitter:card").length === 0) {
    warnings.push("no twitter:card");
  }

  // ── hreflang ─────────────────────────────────────────────────────────────
  const alternates = links(html, "alternate").filter((l) => l.hreflang);
  if (alternates.length > 0) {
    if (!alternates.some((l) => l.hreflang === "x-default")) {
      warnings.push("declares hreflang alternates but no x-default");
    }
    if (!alternates.some((l) => l.href === url)) {
      errors.push("declares hreflang alternates but none point back at itself");
    }
  }

  return report;
}

/** The private pages, checked for the opposite properties. */
async function auditPrivate(base: string, pathname: string): Promise<Report> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const res = await fetch(base + pathname, { redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";

  if (html) {
    const robots = meta(html, "name", "robots").join(" ");
    if (!/noindex/i.test(robots)) {
      errors.push(`must say noindex, says "${robots || "nothing"}"`);
    }
    const canonical = links(html, "canonical").map((l) => l.href);
    if (canonical.length > 0) {
      // The bug this exists for: a canonical inherited from the site-wide
      // config made every private page declare itself a copy of the homepage.
      errors.push(`must not declare a canonical, declares ${canonical[0]}`);
    }
  } else if (res.status >= 500) {
    errors.push(`server error ${res.status}`);
  }
  return { url: pathname, errors, warnings };
}

/** Every image referenced by an `og:image` has to actually be an image. */
async function auditImages(base: string, urls: Set<string>): Promise<string[]> {
  const errors: string[] = [];
  for (const url of urls) {
    const target = url.startsWith(PROD_ORIGIN)
      ? base + url.slice(PROD_ORIGIN.length)
      : url;
    const res = await fetch(target, { redirect: "manual" });
    if (res.status !== 200) {
      errors.push(`og:image ${url} → ${res.status}`);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      errors.push(`og:image ${url} is ${type || "untyped"}, not an image`);
    }
  }
  return errors;
}

// ── server ──────────────────────────────────────────────────────────────────

async function waitForServer(base: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/robots.txt`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server did not answer on ${base} within ${timeoutMs}ms`);
}

async function main() {
  const external = process.env.AUDIT_BASE_URL;
  const base = external ?? `http://localhost:${PORT}`;
  let server: ChildProcess | undefined;
  let stopping = false;

  if (!external) {
    // Next 16's Turbopack production output no longer necessarily writes the
    // legacy `.next/BUILD_ID`; the server and static output directories are the
    // stable indicators that `next start` can serve a build.
    const hasProductionBuild =
      existsSync(path.join(ROOT, ".next/BUILD_ID")) ||
      (existsSync(path.join(ROOT, ".next/server")) &&
        existsSync(path.join(ROOT, ".next/static")));
    if (!hasProductionBuild) {
      console.error(
        red("No production build found — run `bun run build` first."),
      );
      process.exit(1);
    }
    server = spawn("bunx", ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      stdio: "ignore",
    });
    server.on("exit", (code) => {
      // Only a crash counts. The shutdown at the end of the run is our own
      // SIGTERM, which surfaces here as 143.
      if (!stopping && code !== 0) {
        console.error(red(`next start exited with ${code}`));
        process.exit(1);
      }
    });
  }

  try {
    await waitForServer(base);

    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1],
    );
    const urls = usingCiFixtures
      ? sitemapUrls
      : sitemapUrls.filter(isRepositoryOwned);
    if (urls.length === 0) throw new Error("sitemap.xml listed no URLs");
    const discoveryErrors = await auditFixtureDiscovery(base, sitemapUrls);

    console.log(
      dim(
        `Auditing ${urls.length} sitemap URLs on ${base} ` +
          (usingCiFixtures
            ? "(CI content fixtures included)\n"
            : `(${sitemapUrls.length - urls.length} CMS URLs excluded)\n`),
      ),
    );

    const reports: Report[] = [];
    // Eight at a time: enough to keep a local server busy, few enough that the
    // output stays in sitemap order.
    for (let i = 0; i < urls.length; i += 8) {
      reports.push(
        ...(await Promise.all(
          urls.slice(i, i + 8).map((url) => auditPage(base, url)),
        )),
      );
    }
    for (const p of PRIVATE_PATHS) reports.push(await auditPrivate(base, p));

    // ── cross-page uniqueness ──────────────────────────────────────────────
    // Two pages with the same title or description are two pages asking to rank
    // for the same words — the thing that starts happening as a site grows and
    // nobody is looking.
    for (const field of ["title", "description"] as const) {
      const seen = new Map<string, Report[]>();
      for (const r of reports) {
        const value = r[field];
        if (!value) continue;
        seen.set(value, [...(seen.get(value) ?? []), r]);
      }
      for (const [value, group] of seen) {
        if (group.length < 2) continue;
        for (const r of group) {
          r.errors.push(
            `${field} "${value.slice(0, 48)}…" is shared with ${group
              .filter((o) => o !== r)
              .map((o) => new URL(o.url, base).pathname)
              .join(", ")}`,
          );
        }
      }
    }

    // ── og:image reachability ──────────────────────────────────────────────
    const images = new Set<string>();
    for (let i = 0; i < urls.length; i += 8) {
      await Promise.all(
        urls.slice(i, i + 8).map(async (url) => {
          const res = await fetch(base + new URL(url).pathname);
          if (!res.ok) return;
          for (const img of meta(await res.text(), "property", "og:image")) {
            images.add(img);
          }
        }),
      );
    }
    const imageErrors = await auditImages(base, images);

    // ── report ─────────────────────────────────────────────────────────────
    let totalErrors = imageErrors.length + discoveryErrors.length;
    let totalWarnings = 0;
    for (const r of reports) {
      totalErrors += r.errors.length;
      totalWarnings += r.warnings.length;
      const label = r.url.startsWith("http")
        ? new URL(r.url).pathname || "/"
        : r.url;
      if (r.errors.length === 0 && r.warnings.length === 0) {
        console.log(`${green("✓")} ${label}`);
        continue;
      }
      console.log(`${r.errors.length ? red("✗") : yellow("⚠")} ${bold(label)}`);
      for (const e of r.errors) console.log(`    ${red("error")}  ${e}`);
      for (const w of r.warnings) console.log(`    ${yellow("warn")}   ${w}`);
    }
    for (const e of imageErrors) console.log(`${red("✗")} ${e}`);
    for (const e of discoveryErrors) {
      console.log(`${red("✗")} fixture discovery: ${e}`);
    }

    console.log(
      dim("─".repeat(40)) +
        `\n${reports.length} pages · ${images.size} social images · ` +
        `${totalErrors ? red(`${totalErrors} errors`) : green("0 errors")} · ` +
        `${totalWarnings ? yellow(`${totalWarnings} warnings`) : "0 warnings"}`,
    );

    process.exitCode = totalErrors > 0 ? 1 : 0;
  } finally {
    stopping = true;
    server?.kill("SIGTERM");
  }
}

await main();
