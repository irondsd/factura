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
import { CATEGORY_IDS, isCategoryId } from "../src/content/guias/categories";

const here = path.dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = path.join(here, "../src/content/guias");

// Path segments under /guias that are real routes, not guides. A guide with one
// of these slugs would be shadowed by the route and never render.
const RESERVED_SLUGS = new Set(["categoria"]);

// Components registered in `src/mdx-components.tsx` — the only custom (capitalized)
// JSX a guide may use. Anything else would crash the build.
const ALLOWED_COMPONENTS = new Set([
  "CtaButton",
  "CtaRow",
  "DemoCta",
  "Faq",
  "ProbarCta",
  "SignupCta",
  "RelatedGuides",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Full ISO 8601 with an explicit offset (or Z). Google only requires the date,
// but recommends time + timezone in markup, and the site renders the timestamp
// visibly — so requiring it here keeps the two consistent by construction.
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;

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
function extractMeta(src: string): {
  meta?: Meta;
  bodyStart: number;
  error?: string;
} {
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
  if (end === -1)
    return { bodyStart: 0, error: "meta block `{` is never closed" };

  const objText = src.slice(open, end + 1);
  try {
    const meta = new Function(`return (${objText})`)() as Meta;
    return { meta, bodyStart: end + 1 };
  } catch (e) {
    return {
      bodyStart: end + 1,
      error: `meta is not valid JS: ${(e as Error).message}`,
    };
  }
}

function isValidDateTime(s: string): boolean {
  const m = DATETIME_RE.exec(s);
  if (!m) return false;
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  // Reject the calendar-impossible (Feb 30) and out-of-range clock values that
  // the regex alone would wave through.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d &&
    h < 24 &&
    mi < 60 &&
    sec < 60
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
  if (RESERVED_SLUGS.has(slug)) {
    errors.push(`slug "${slug}" is a reserved /guias route — rename the file`);
  }

  // ── no YAML frontmatter ───────────────────────────────────────────────────
  if (src.trimStart().startsWith("---")) {
    errors.push(
      "starts with `---` frontmatter; use the `export const meta` block instead",
    );
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
    if (
      !Array.isArray(kw) ||
      kw.length === 0 ||
      !kw.every((k) => typeof k === "string")
    ) {
      errors.push("meta.keywords must be a non-empty array of strings");
    } else if (kw.length < 3 || kw.length > 6) {
      warnings.push(`meta.keywords has ${kw.length} (aim for 3–6)`);
    }

    // ── categories (the first one is the guide's primary category) ──────────
    const cats = meta.categories;
    if (
      !Array.isArray(cats) ||
      cats.length === 0 ||
      !cats.every((c) => typeof c === "string")
    ) {
      errors.push(
        `meta.categories must be a non-empty array of ids (${CATEGORY_IDS.join(", ")})`,
      );
    } else {
      for (const cat of cats as string[]) {
        if (!isCategoryId(cat)) {
          errors.push(
            `meta.categories has unknown id "${cat}" — valid ids: ${CATEGORY_IDS.join(", ")}`,
          );
        }
      }
      if (new Set(cats as string[]).size !== cats.length) {
        errors.push("meta.categories has duplicate ids");
      }
      if (cats.length > 3) {
        warnings.push(
          `meta.categories has ${cats.length} (aim for 1–3; the first is the primary)`,
        );
      }
    }

    // ── faq (optional) ──────────────────────────────────────────────────────
    // The markup and the rendered block are both built from this list, so the
    // only way they can disagree is if the body forgets to place <Faq />. That
    // mismatch is the thing worth catching: FAQPage JSON-LD describing Q&A the
    // visitor can't see is exactly what Google's spam guidance is aimed at.
    const faq = meta.faq;
    const placesFaq = /<Faq\b/.test(body);
    if (faq !== undefined) {
      if (!Array.isArray(faq) || faq.length === 0) {
        errors.push("meta.faq must be a non-empty array of { q, a } objects");
      } else {
        faq.forEach((item, i) => {
          const ok =
            item !== null &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).q === "string" &&
            ((item as Record<string, unknown>).q as string).trim() !== "" &&
            typeof (item as Record<string, unknown>).a === "string" &&
            ((item as Record<string, unknown>).a as string).trim() !== "";
          if (!ok) {
            errors.push(
              `meta.faq[${i}] must be { q: "…", a: "…" } with both non-empty`,
            );
            return;
          }
          // Answers are plain text on purpose (see GuideMeta.faq): the schema
          // string and the rendered string have to be byte-identical, and a
          // markdown link would render as literal brackets in the <dd>.
          const a = (item as Record<string, string>).a;
          if (/\[[^\]]*\]\([^)]*\)|<[a-zA-Z]/.test(a)) {
            errors.push(
              `meta.faq[${i}].a contains markup — answers are plain text; put links in the prose`,
            );
          }
        });
        if (faq.length < 3) {
          warnings.push(
            `meta.faq has ${faq.length} (aim for 4–6 real search questions)`,
          );
        }
        if (!placesFaq) {
          errors.push(
            "meta.faq is set but the body never places <Faq /> — the markup would describe questions the page doesn't show",
          );
        }
      }
    } else if (placesFaq) {
      errors.push("body places <Faq /> but meta.faq is missing");
    }

    const published = meta.published;
    const updated = meta.updated;
    const pubOk = typeof published === "string" && isValidDateTime(published);
    const updOk = typeof updated === "string" && isValidDateTime(updated);
    const format =
      'full ISO 8601 with offset, e.g. "2026-06-29T09:00:00-03:00"';
    if (!pubOk) errors.push(`meta.published must be a ${format}`);
    if (!updOk) errors.push(`meta.updated must be a ${format}`);
    // Compare instants, not strings — two timestamps with different offsets
    // don't order correctly as text.
    if (
      pubOk &&
      updOk &&
      Date.parse(updated as string) < Date.parse(published as string)
    ) {
      errors.push(
        `meta.updated (${updated}) is before meta.published (${published})`,
      );
    }

    // length advisories
    if (title && title.length > 60)
      warnings.push(`meta.title is ${title.length} chars (aim ≤60)`);
    if (description && (description.length < 120 || description.length > 170)) {
      warnings.push(
        `meta.description is ${description.length} chars (aim ~150–160)`,
      );
    }

    // unexpected meta keys (typos)
    const allowedKeys = new Set([
      "title",
      "description",
      "summary",
      "keywords",
      "categories",
      "published",
      "updated",
      "faq",
    ]);
    for (const k of Object.keys(meta)) {
      if (!allowedKeys.has(k)) warnings.push(`meta has unexpected key "${k}"`);
    }
  }

  // ── body: no H1 (the page renders the <h1> from meta.title) ───────────────
  if (/^#[ \t]/m.test(body)) {
    errors.push(
      "body contains an H1 (`# …`); start sections at `##` (the page adds the H1)",
    );
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
      errors.push(
        `unknown component <${m[1]}/> (not registered in mdx-components.tsx)`,
      );
    }
  }

  // ── advisories ────────────────────────────────────────────────────────────
  if (!/^##[ \t]/m.test(body)) warnings.push("no `##` section headings found");
  if (!/<(CtaRow|DemoCta|SignupCta|CtaButton)\b/.test(body)) {
    warnings.push("no CTA component — guides should end with a call to action");
  }
  // Placement is the author's job, so a missing tag just silently drops the
  // block — worth flagging.
  if (!/<RelatedGuides\b/.test(body)) {
    warnings.push("no <RelatedGuides /> — add it just above the closing CTA");
  }
  if (interlinks.size === 0) {
    warnings.push("no links to other guides (interlink for SEO)");
  }

  return { file, errors, warnings };
}

function main() {
  let files: string[];
  try {
    files = readdirSync(GUIDES_DIR)
      .filter((f) => f.endsWith(".mdx"))
      .sort();
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
