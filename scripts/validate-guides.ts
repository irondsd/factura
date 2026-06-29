#!/usr/bin/env bun
/**
 * Validates the guide MDX files in `src/content/guias` against the authoring
 * format (see `src/content/guias/AUTHORING.md`). Mirrors the `GuideMeta` type in
 * `src/content/guias/guides.ts`.
 *
 * Run: `bun scripts/validate-guides.ts`  (or `npm run validate:guides`)
 * Exit code is 1 if any ERROR is found (warnings don't fail the run).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = path.join(here, "../src/content/guias");

// Components registered in `src/mdx-components.tsx` — the only custom (capitalized)
// JSX a guide may use. Anything else would crash the build.
const ALLOWED_COMPONENTS = new Set([
  "CtaButton",
  "CtaRow",
  "DemoCta",
  "SignupCta",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── tiny ANSI helpers (no deps) ─────────────────────────────────────────────
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (n: number, s: string) => (color ? `\x1b[${n}m${s}\x1b[0m` : s);
const red = (s: string) => c(31, s);
const yellow = (s: string) => c(33, s);
const green = (s: string) => c(32, s);
const dim = (s: string) => c(2, s);
const bold = (s: string) => c(1, s);

type Meta = Record<string, unknown>;
type Report = { file: string; errors: string[]; warnings: string[] };

/** Pull the `export const meta = { … }` object out by brace-matching, then eval
 * it as real JS (trusted local files, any quote/comma style). */
function extractMeta(src: string): { meta?: Meta; bodyStart: number; error?: string } {
  const marker = src.match(/export\s+const\s+meta\s*=\s*/);
  if (!marker || marker.index === undefined) {
    return { bodyStart: 0, error: "missing `export const meta = { … }` block" };
  }
  const open = src.indexOf("{", marker.index);
  if (open === -1) return { bodyStart: 0, error: "meta block has no `{`" };

  let depth = 0;
  let inStr: string | null = null;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inStr) {
      if (ch === inStr && prev !== "\\") inStr = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return { bodyStart: 0, error: "meta block `{` is never closed" };

  const objText = src.slice(open, end + 1);
  try {
    const meta = new Function(`return (${objText})`)() as Meta;
    return { meta, bodyStart: end + 1 };
  } catch (e) {
    return { bodyStart: end + 1, error: `meta is not valid JS: ${(e as Error).message}` };
  }
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function validateFile(file: string, knownSlugs: Set<string>): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slug = file.replace(/\.mdx$/, "");
  const src = readFileSync(path.join(GUIDES_DIR, file), "utf8");

  // ── slug ────────────────────────────────────────────────────────────────
  if (!SLUG_RE.test(slug)) {
    errors.push(
      `filename slug "${slug}" must be lowercase, hyphen-separated, no accents/spaces`,
    );
  }

  // ── no YAML frontmatter ───────────────────────────────────────────────────
  if (src.trimStart().startsWith("---")) {
    errors.push("starts with `---` frontmatter; use the `export const meta` block instead");
  }

  // ── meta ──────────────────────────────────────────────────────────────────
  const { meta, bodyStart, error } = extractMeta(src);
  if (error) errors.push(error);
  const body = src.slice(bodyStart);

  if (meta) {
    const str = (k: string): string | undefined => {
      const v = meta[k];
      if (typeof v !== "string" || v.trim() === "") {
        errors.push(`meta.${k} must be a non-empty string`);
        return undefined;
      }
      return v;
    };
    const title = str("title");
    const description = str("description");
    str("summary");

    const kw = meta.keywords;
    if (!Array.isArray(kw) || kw.length === 0 || !kw.every((k) => typeof k === "string")) {
      errors.push("meta.keywords must be a non-empty array of strings");
    } else if (kw.length < 3 || kw.length > 6) {
      warnings.push(`meta.keywords has ${kw.length} (aim for 3–6)`);
    }

    const published = meta.published;
    const updated = meta.updated;
    const pubOk = typeof published === "string" && isValidDate(published);
    const updOk = typeof updated === "string" && isValidDate(updated);
    if (!pubOk) errors.push("meta.published must be a valid YYYY-MM-DD date");
    if (!updOk) errors.push("meta.updated must be a valid YYYY-MM-DD date");
    if (pubOk && updOk && (updated as string) < (published as string)) {
      errors.push(`meta.updated (${updated}) is before meta.published (${published})`);
    }

    // length advisories
    if (title && title.length > 60) warnings.push(`meta.title is ${title.length} chars (aim ≤60)`);
    if (description && (description.length < 120 || description.length > 170)) {
      warnings.push(`meta.description is ${description.length} chars (aim ~150–160)`);
    }

    // unexpected meta keys (typos)
    const allowedKeys = new Set([
      "title", "description", "summary", "keywords", "published", "updated",
    ]);
    for (const k of Object.keys(meta)) {
      if (!allowedKeys.has(k)) warnings.push(`meta has unexpected key "${k}"`);
    }
  }

  // ── body: no H1 (the page renders the <h1> from meta.title) ───────────────
  if (/^#[ \t]/m.test(body)) {
    errors.push("body contains an H1 (`# …`); start sections at `##` (the page adds the H1)");
  }

  // ── internal /guias links resolve ─────────────────────────────────────────
  const linkRe = /\]\((\/guias\/[^)\s#]+)/g;
  const interlinks = new Set<string>();
  for (const m of body.matchAll(linkRe)) {
    const target = m[1].replace(/\/$/, ""); // e.g. /guias/foo
    const targetSlug = target.slice("/guias/".length);
    if (targetSlug === "") continue; // the index page
    if (!knownSlugs.has(targetSlug)) {
      errors.push(`broken internal link → ${target} (no such guide)`);
    } else if (targetSlug !== slug) {
      interlinks.add(targetSlug);
    } else {
      warnings.push("links to itself");
    }
  }

  // ── custom components must be registered ──────────────────────────────────
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    if (!ALLOWED_COMPONENTS.has(m[1])) {
      errors.push(`unknown component <${m[1]}/> (not registered in mdx-components.tsx)`);
    }
  }

  // ── advisories ────────────────────────────────────────────────────────────
  if (!/^##[ \t]/m.test(body)) warnings.push("no `##` section headings found");
  if (!/<(CtaRow|DemoCta|SignupCta|CtaButton)\b/.test(body)) {
    warnings.push("no CTA component — guides should end with a call to action");
  }
  if (interlinks.size === 0) {
    warnings.push("no links to other guides (interlink for SEO)");
  }

  return { file, errors, warnings };
}

function main() {
  let files: string[];
  try {
    files = readdirSync(GUIDES_DIR).filter((f) => f.endsWith(".mdx")).sort();
  } catch {
    console.error(red(`Cannot read ${GUIDES_DIR}`));
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(red("No .mdx guides found."));
    process.exit(1);
  }

  const knownSlugs = new Set(files.map((f) => f.replace(/\.mdx$/, "")));
  const reports = files.map((f) => validateFile(f, knownSlugs));

  let totalErrors = 0;
  let totalWarnings = 0;
  for (const r of reports) {
    totalErrors += r.errors.length;
    totalWarnings += r.warnings.length;
    if (r.errors.length === 0 && r.warnings.length === 0) {
      console.log(`${green("✓")} ${r.file}`);
      continue;
    }
    const tag = r.errors.length ? red("✗") : yellow("⚠");
    console.log(`${tag} ${bold(r.file)}`);
    for (const e of r.errors) console.log(`    ${red("error")}  ${e}`);
    for (const w of r.warnings) console.log(`    ${yellow("warn")}   ${w}`);
  }

  console.log(
    dim("─".repeat(40)) +
      `\n${files.length} files · ` +
      `${totalErrors ? red(`${totalErrors} errors`) : green("0 errors")} · ` +
      `${totalWarnings ? yellow(`${totalWarnings} warnings`) : "0 warnings"}`,
  );

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
