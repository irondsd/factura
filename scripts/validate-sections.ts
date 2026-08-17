#!/usr/bin/env bun
/**
 * Validates the *registry* content sections — `/estadisticas` and
 * `/investigacion` — against their authoring format (see the `AUTHORING.md` in
 * each). Mirrors the `SectionMeta` type in `src/content/section.ts`.
 *
 * Run: `bun scripts/validate-sections.ts` (or `npm run validate:sections`);
 * `validate:stats` and `validate:investigacion` are the same pass over one
 * section, and `validate:content` adds the guides and the cross-section
 * title/description collision check.
 *
 * Exit code is 1 if any ERROR is found (warnings don't fail the run).
 *
 * The guides' validator is the model, but these sections differ in three ways
 * that shape this file:
 *
 *  - **A page's URL is a path, and the set of pages is an explicit registry.**
 *    So there are two ways to ship a page nobody can reach — an `.mdx` missing
 *    from `ENTRIES`, or an entry whose `file`/`load` point at a different page's
 *    source — and both are checked here rather than by the build, which happily
 *    renders whatever the registry names.
 *  - **A page publishes a dataset.** `meta.sources` and `meta.dataset` feed the
 *    `Dataset` structured data as well as the visible sources block, so the
 *    checks around them are about the markup and the page agreeing.
 *  - **Links and related-page cards cross between the sections.** A research
 *    page exists to send the reader back to the series it joined, so link
 *    resolution has to know about every section at once. That is why the whole
 *    world is parsed even when only one section's reports are asked for.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  extractHeadings,
  FAQ_SECTION,
  SOURCES_SECTION,
} from "../src/content/headings";
import { mdxBody } from "../src/content/mdx";
import {
  CONTENT_DIR,
  DATETIME_FORMAT,
  extractMeta,
  finish,
  isEntrypoint,
  isRef,
  isValidDateTime,
  matchBrace,
  missingKeywordWords,
  newReport,
  refName,
  type Report,
  SLUG_RE,
} from "./lib/content";

/** Where `meta.preview` is resolved from — same rule as `CONTENT_DIR`. */
const PUBLIC_DIR = path.join(CONTENT_DIR, "../../public");
const MDX_COMPONENTS = path.join(CONTENT_DIR, "../mdx-components.tsx");

/** The sections this file knows about. `id` is load-bearing in four places at
 * once — the content dir, the URL prefix, the preview dir and the figure
 * component dir — which is the convention `src/content/section.ts` documents. */
export const SECTION_CONFIGS = [
  {
    id: "estadisticas",
    base: "estadisticas",
    /** Heading for this section's block of the report. */
    name: "Estadísticas",
    /** Used in error copy: "…is not a statistics page". */
    noun: "statistics page",
  },
  {
    id: "investigacion",
    base: "investigaciones",
    name: "Investigación",
    noun: "research page",
  },
] as const;

type SectionConfig = (typeof SECTION_CONFIGS)[number];

const dirOf = (id: string) => path.join(CONTENT_DIR, id);

// Preview images live in one flat directory per section and are named after the
// page they illustrate, with the slug's segments joined by "-" (a nested page's
// file is `inflacion-de-vivienda-gba.jpg`), so a stale file is obvious from `ls`
// alone once its page is gone.
const previewRe = (id: string) =>
  new RegExp(`^/img/${id}/previews/[a-z0-9-]+\\.(?:jpg|png|webp)$`);

// ── globally available MDX components ───────────────────────────────────────
// `mdx-components.tsx` contains only shared article furniture. Data figures are
// imported by the one MDX page that uses them, which keeps unrelated chart
// clients out of every content route's browser bundle.

function registeredComponents(): {
  all: Set<string>;
  error?: string;
} {
  const src = readFileSync(MDX_COMPONENTS, "utf8");

  const open = src.indexOf("{", src.indexOf("const components: MDXComponents"));
  const close = open === -1 ? -1 : matchBrace(src, open);
  const map = close === -1 ? "" : src.slice(open, close + 1);
  // Top-level keys of the map, which are indented by exactly two spaces.
  const all = new Set(
    [...map.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*)\s*[,:]/gm)].map((m) => m[1]),
  );

  // If the parse ever breaks, say so once instead of calling every component on
  // every page unregistered.
  const error =
    all.size < 10
      ? `only ${all.size} components parsed out of ${path.basename(MDX_COMPONENTS)} — the \`const components: MDXComponents = { … }\` map is what this validator reads`
      : undefined;
  return { all, error };
}

/** Components imported by one MDX source. Imports from that section's own
 * component directory are its data figures; imports from shared directories
 * are available but do not count toward the "figure comes first" advisory. */
function localComponents(
  src: string,
  sectionId: string,
): { all: Set<string>; figures: Set<string> } {
  const all = new Set<string>();
  const figures = new Set<string>();
  for (const match of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*"(@\/components\/[^\"]+)"/g,
  )) {
    for (const imported of match[1].split(",")) {
      const name = imported
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .at(-1);
      if (!name) continue;
      all.add(name);
      if (match[2].startsWith(`@/components/${sectionId}/`)) {
        figures.add(name);
      }
    }
  }
  return { all, figures };
}

// ── the registry in pages.ts ────────────────────────────────────────────────

type Entry = {
  slug: string[];
  crumb?: string;
  /** `file:` — the source the word count and the table of contents read. */
  file?: string;
  /** The path inside `load: () => import("…")` — what actually renders. */
  importPath?: string;
};

/** Pull `ENTRIES` out of a section's `pages.ts` textually. The module can't be
 * imported here: it's `server-only` and its `load` thunks are MDX imports only a
 * bundler can resolve. */
function parseEntries(src: string): { entries: Entry[]; error?: string } {
  const marker = src.indexOf("const ENTRIES: SectionEntry[] =");
  // Not `indexOf("[")` from the marker — that finds the one in `SectionEntry[]`.
  const open = marker === -1 ? -1 : src.indexOf("[", src.indexOf("=", marker));
  const end = open === -1 ? -1 : matchBrace(src, open);
  if (end === -1) {
    return {
      entries: [],
      error:
        "cannot find `const ENTRIES: SectionEntry[] = [ … ]` — this validator parses it textually, so keep the declaration in that shape",
    };
  }

  const entries: Entry[] = [];
  const body = src.slice(open + 1, end);
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "{") continue;
    const close = matchBrace(body, i);
    if (close === -1) break;
    const obj = body.slice(i, close + 1);
    i = close;

    const slug = /slug:\s*\[([^\]]*)\]/.exec(obj);
    entries.push({
      slug: slug ? [...slug[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [],
      crumb: /crumb:\s*"([^"]*)"/.exec(obj)?.[1],
      file: /file:\s*"([^"]*)"/.exec(obj)?.[1],
      importPath: /import\(\s*"([^"]*)"\s*\)/.exec(obj)?.[1],
    });
  }
  return { entries };
}

/** Every `.mdx` under a section, as a path relative to it ("gba.mdx",
 * "inflacion-de-vivienda/gba.mdx"). */
function mdxFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (e.isDirectory()) {
      // `data/` holds the series, not pages.
      if (e.name !== "data")
        out.push(...mdxFiles(path.join(dir, e.name), `${prefix}${e.name}/`));
    } else if (e.name.endsWith(".mdx")) {
      out.push(`${prefix}${e.name}`);
    }
  }
  return out;
}

/** Registry-level checks — the ones about the set of pages rather than about
 * any one page. Reported against `pages.ts`, which is where they're fixed. */
function validateRegistry(
  cfg: SectionConfig,
  entries: Entry[],
  files: string[],
): Report {
  const r = newReport(`${cfg.id}/pages.ts`);
  const { errors, warnings } = r;

  const known = new Set(entries.map((e) => e.slug.join("/")));
  const seen = new Set<string>();
  const onDisk = new Set(files);

  for (const entry of entries) {
    const at = entry.slug.join("/") || "(no slug)";

    if (entry.slug.length === 0) {
      errors.push(`an entry has no \`slug: [ … ]\``);
      continue;
    }
    for (const segment of entry.slug) {
      if (!SLUG_RE.test(segment)) {
        errors.push(
          `/${at}: segment "${segment}" must be lowercase, hyphen-separated, no accents/spaces`,
        );
      }
    }
    if (seen.has(at)) errors.push(`/${at} is registered twice`);
    seen.add(at);

    // Every intermediate segment must be a page of its own, or the breadcrumb
    // links to a 404. `createSection` throws on this at build time; catching it
    // here names the fix instead of the stack trace.
    for (let i = 1; i < entry.slug.length; i++) {
      const parent = entry.slug.slice(0, i).join("/");
      if (!known.has(parent)) {
        errors.push(
          `/${at} has no parent page at /${parent} — every intermediate segment needs its own page`,
        );
      }
    }

    // `file` is what the word count and the table of contents read; the `load`
    // thunk is what actually renders. Both have to be this page's own source,
    // and the convention that both follow the slug is what keeps the three in
    // step. A copy-pasted entry pointing at a sibling's `.mdx` renders the
    // wrong page under the right URL, and nothing else would notice.
    const expected = `${at}.mdx`;
    if (!entry.file) {
      errors.push(`/${at}: entry has no \`file:\``);
    } else if (entry.file !== expected) {
      errors.push(
        `/${at}: file is "${entry.file}" but the slug says "${expected}"`,
      );
    } else if (!onDisk.has(entry.file)) {
      errors.push(`/${at}: file "${entry.file}" does not exist`);
    }
    if (!entry.importPath) {
      errors.push(`/${at}: entry has no \`load: () => import("…")\``);
    } else if (entry.importPath !== `./${expected}`) {
      errors.push(
        `/${at}: load imports "${entry.importPath}" but the slug says "./${expected}"`,
      );
    }

    if (!entry.crumb?.trim()) {
      errors.push(`/${at}: entry has no \`crumb:\``);
    } else if (entry.crumb.length > 28) {
      warnings.push(
        `/${at}: crumb "${entry.crumb}" is ${entry.crumb.length} chars — it's a breadcrumb label, not the headline`,
      );
    }
  }

  // The other direction: a page that exists but was never registered renders
  // nowhere at all — `dynamicParams = false` 404s it.
  const registered = new Set(entries.map((e) => e.file));
  for (const file of files) {
    if (!registered.has(file)) {
      errors.push(
        `${file} is not in ENTRIES — the route 404s it and no listing shows it`,
      );
    }
  }

  return r;
}

// ── one page ────────────────────────────────────────────────────────────────

/** ISO 8601 interval, as `Dataset.temporalCoverage` wants it: "2020-01/2026-06",
 * or open-ended with a trailing slash. */
const INTERVAL_RE = /^\d{4}(-\d{2}){0,2}\/(\d{4}(-\d{2}){0,2})?$/;

type PageReport = Report & {
  /** URL path under the section, e.g. "delitos-caba". */
  at: string;
  noindex: boolean;
  /** `<section id>/<path>` of the other section pages this one links to. */
  links: string[];
};

/** One section's own shape, as the link checker sees it. */
type SectionIndex = {
  cfg: SectionConfig;
  /** Registered page paths, for link resolution. */
  paths: Set<string>;
  /** Page path → the heading ids on it, for `#anchor` links. */
  anchors: Map<string, Set<string>>;
  /** Page paths that have child pages. */
  hubs: Set<string>;
};

/** Everything a page is checked against: its own section, every other one it
 * may link into, and the guides. */
type World = {
  components: ReturnType<typeof registeredComponents>;
  sections: Map<string, SectionIndex>;
  guides: Set<string>;
};

function validatePage(
  cfg: SectionConfig,
  file: string,
  at: string,
  world: World,
): PageReport {
  const r: PageReport = {
    ...newReport(`${cfg.id}/${file}`),
    at,
    noindex: false,
    links: [],
  };
  const { errors, warnings } = r;
  const self = world.sections.get(cfg.id)!;
  const src = readFileSync(path.join(dirOf(cfg.id), file), "utf8");
  const local = localComponents(src, cfg.id);

  if (src.trimStart().startsWith("---")) {
    errors.push(
      "starts with `---` frontmatter; use the `export const meta` block instead",
    );
  }

  const { meta, bodyStart, error } = extractMeta(src);
  if (error) errors.push(error);
  const body = src.slice(bodyStart);
  const has = (tag: string) => new RegExp(`<${tag}[\\s/>]`).test(body);

  if (meta) {
    // A field whose value is an imported binding (see `isRef`) is present and
    // correct by construction — it just can't be measured here.
    const str = (k: string): string | undefined => {
      const v = meta[k];
      if (typeof v !== "string" || v.trim() === "") {
        errors.push(`meta.${k} must be a non-empty string`);
        return undefined;
      }
      return isRef(v) ? undefined : v;
    };
    const optStr = (k: string): string | undefined => {
      const v = meta[k];
      if (v === undefined) return undefined;
      if (typeof v !== "string" || v.trim() === "") {
        errors.push(`meta.${k}, if set, must be a non-empty string`);
        return undefined;
      }
      return isRef(v) ? undefined : v;
    };

    r.title = str("title");
    r.description = str("description");
    str("summary");
    const cta = str("cta");
    const { title, description } = r;
    const titleTag = optStr("titleTag");
    const ogTitle = optStr("ogTitle");
    const ogDescription = optStr("ogDescription");
    const ogStat = optStr("ogStat");

    // ── preview: the optional 16:9 thumbnail the listings show ──────────────
    // Optional, but a present-and-broken one is an error rather than a warning:
    // a typo'd path renders a broken image on the index, which is worse than
    // the text-only row the page would otherwise have had.
    const preview = meta.preview;
    if (preview !== undefined) {
      if (typeof preview !== "string" || !previewRe(cfg.id).test(preview)) {
        errors.push(
          `meta.preview, if set, must be a path like "/img/${cfg.id}/previews/${at.replace(/\//g, "-")}.jpg"`,
        );
      } else if (!existsSync(path.join(PUBLIC_DIR, preview))) {
        errors.push(`meta.preview "${preview}" is not a file under public/`);
      }
    }

    if (meta.noindex !== undefined && meta.noindex !== true) {
      errors.push("meta.noindex, if set, must be exactly `true` (or omitted)");
    }
    r.noindex = meta.noindex === true;

    // The rendered <title>. `sectionMetadata` sets it absolute — no "— Factura"
    // suffix — so this is the whole thing, and past ~60 chars Google truncates
    // it mid-phrase in the result.
    const rendered = titleTag ?? title;
    if (rendered && rendered.length > 60) {
      errors.push(
        titleTag
          ? `meta.titleTag is ${rendered.length} chars — must be ≤60`
          : `meta.title is ${rendered.length} chars and would be cut off in search results — shorten it, or add a meta.titleTag ≤60 and keep this as the headline`,
      );
    }
    // No "titleTag should be shorter than title" advisory here, unlike the
    // guides. These sections use the pair the other way round on purpose: the
    // <h1> is the conversational headline ("Cuánto sale alquilar en CABA") and
    // the <title> is the phrase people search ("Precio de alquileres en CABA
    // por barrio y comuna"), which is often the longer of the two.
    //
    // The social card sets `meta.title` (never the titleTag) at a size stepped
    // down by length, bottoming out at 58px — which is three lines, and there
    // is no fourth. See `headlineSize` in components/section/card.tsx.
    if (title && title.length > 110) {
      warnings.push(
        `meta.title is ${title.length} chars — over ~110 it overflows the social card`,
      );
    }
    if (ogTitle && ogTitle.length > 70) {
      warnings.push(`meta.ogTitle is ${ogTitle.length} chars (aim ≤70)`);
    }
    if (ogDescription && ogDescription.length > 200) {
      warnings.push(
        `meta.ogDescription is ${ogDescription.length} chars (aim ≤200)`,
      );
    }
    // One line of 36px mono in the card's 1048px text column, with no wrap.
    if (ogStat && ogStat.length > 44) {
      warnings.push(
        `meta.ogStat is ${ogStat.length} chars — over ~44 it runs off the card`,
      );
    }
    if (description && (description.length < 120 || description.length > 170)) {
      warnings.push(
        `meta.description is ${description.length} chars (aim ~150–160)`,
      );
    }
    // Same <TopCta /> as a guide, in these sections' wider column. Measured in
    // the browser rather than scaled from the guides' 54: the article is capped
    // at 716px here by the contents sidebar beside it, which leaves the copy 58
    // characters of 13.5px mono before it wraps to a second line.
    if (cta && cta.length > 58) {
      warnings.push(
        `meta.cta is ${cta.length} chars — over 58 it wraps to a second line beside the button`,
      );
    }

    const kw = meta.keywords;
    if (
      !Array.isArray(kw) ||
      kw.length === 0 ||
      !kw.every((k) => typeof k === "string")
    ) {
      errors.push("meta.keywords must be a non-empty array of strings");
    } else if (kw.length < 3) {
      warnings.push(`meta.keywords has ${kw.length} (aim for at least 3)`);
    } else if (kw.length > 25) {
      warnings.push(
        `meta.keywords has ${kw.length} — past a couple of dozen it reads as stuffing`,
      );
    }
    // Against `rendered`, not `title`: these sections put the search phrase in
    // the titleTag on purpose (see above), so the words a result shows are the
    // titleTag's when there is one.
    if (
      Array.isArray(kw) &&
      typeof kw[0] === "string" &&
      rendered &&
      description
    ) {
      const missing = missingKeywordWords(kw[0], rendered, description);
      if (missing.length > 0) {
        warnings.push(
          `primary keyword "${kw[0]}" — ${missing.map((w) => `"${w}"`).join(", ")} appears in neither the title nor the description`,
        );
      }
    }

    const published = meta.published;
    const updated = meta.updated;
    const pubOk = isValidDateTime(published);
    const updOk = isValidDateTime(updated);
    if (!pubOk) errors.push(`meta.published must be a ${DATETIME_FORMAT}`);
    if (!updOk) errors.push(`meta.updated must be a ${DATETIME_FORMAT}`);
    if (pubOk && updOk && Date.parse(updated) < Date.parse(published)) {
      errors.push(
        `meta.updated (${updated}) is before meta.published (${published})`,
      );
    }

    // ── sources ─────────────────────────────────────────────────────────────
    // One list, two consumers: the visible block the body places with
    // <Fuentes />, and the `creator` of the Dataset markup. A page that
    // declared a source it doesn't show is the markup/page mismatch these
    // sections are otherwise careful to make impossible.
    const sources = meta.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      errors.push(
        "meta.sources must be a non-empty array of { label, href, note? } — a data page cites where its numbers come from",
      );
    } else {
      const hrefs = new Set<string>();
      sources.forEach((item, i) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          errors.push(`meta.sources[${i}] must be { label: "…", href: "…" }`);
          return;
        }
        const s = item as Record<string, unknown>;
        for (const key of Object.keys(s)) {
          if (!["label", "href", "note"].includes(key)) {
            warnings.push(
              `meta.sources[${i}] has unknown key "${key}" — only label, href, note`,
            );
          }
        }
        if (typeof s.label !== "string" || s.label.trim() === "") {
          errors.push(`meta.sources[${i}].label must be a non-empty string`);
        }
        if (typeof s.href !== "string" || !/^https?:\/\//.test(s.href)) {
          errors.push(
            `meta.sources[${i}].href must be an absolute http(s) URL to the publisher`,
          );
        } else if (hrefs.has(s.href)) {
          // <Fuentes /> keys the list by href, so two identical ones are a
          // duplicate React key as well as a repeated line.
          errors.push(`meta.sources[${i}].href is listed twice: ${s.href}`);
        } else {
          hrefs.add(s.href);
        }
        if (
          s.note !== undefined &&
          (typeof s.note !== "string" || s.note.trim() === "")
        ) {
          errors.push(`meta.sources[${i}].note, if set, must be non-empty`);
        }
      });
      if (!has("Fuentes")) {
        errors.push(
          "meta.sources is set but the body never places <Fuentes /> — the Dataset markup would credit sources the page doesn't show",
        );
      }
    }
    if (sources === undefined && has("Fuentes")) {
      errors.push("body places <Fuentes /> but meta.sources is missing");
    }

    // ── dataset (the Dataset structured data) ───────────────────────────────
    const dataset = meta.dataset;
    if (
      dataset === null ||
      typeof dataset !== "object" ||
      Array.isArray(dataset)
    ) {
      errors.push(
        "meta.dataset must be an object describing the series — see SectionMeta in content/section.ts",
      );
    } else {
      const d = dataset as Record<string, unknown>;
      const known = [
        "name",
        "description",
        "temporalCoverage",
        "spatialCoverage",
        "variableMeasured",
      ];
      for (const key of Object.keys(d)) {
        if (!known.includes(key)) {
          warnings.push(`meta.dataset has unknown key "${key}"`);
        }
      }
      for (const key of ["name", "description", "spatialCoverage"]) {
        if (typeof d[key] !== "string" || (d[key] as string).trim() === "") {
          errors.push(`meta.dataset.${key} must be a non-empty string`);
        }
      }
      const cov = d.temporalCoverage;
      if (typeof cov !== "string" || cov.trim() === "") {
        errors.push("meta.dataset.temporalCoverage must be a non-empty string");
      } else if (!isRef(cov)) {
        // Typed in by hand, so it is wrong the first time the series is
        // refreshed — the data module exports the derived value for this.
        warnings.push(
          `meta.dataset.temporalCoverage is the literal "${cov}" — import TEMPORAL_COVERAGE from the data module so it can't go stale`,
        );
        if (!INTERVAL_RE.test(cov)) {
          errors.push(
            `meta.dataset.temporalCoverage must be an ISO 8601 interval, e.g. "2020-01/2026-06" (got "${cov}")`,
          );
        }
      } else if (refName(cov) !== "TEMPORAL_COVERAGE") {
        warnings.push(
          `meta.dataset.temporalCoverage is \`${refName(cov)}\` — the data modules export it as TEMPORAL_COVERAGE`,
        );
      }
      const vars = d.variableMeasured;
      if (
        !Array.isArray(vars) ||
        vars.length === 0 ||
        !vars.every((v) => typeof v === "string" && v.trim() !== "")
      ) {
        errors.push(
          "meta.dataset.variableMeasured must be a non-empty array of strings — what each series measures",
        );
      }
    }

    // ── faq (optional) ──────────────────────────────────────────────────────
    const faq = meta.faq;
    if (faq !== undefined) {
      if (!Array.isArray(faq) || faq.length === 0) {
        errors.push("meta.faq must be a non-empty array of { q, a } objects");
      } else {
        faq.forEach((item, i) => {
          const q = (item as Record<string, unknown>)?.q;
          const a = (item as Record<string, unknown>)?.a;
          if (
            typeof q !== "string" ||
            q.trim() === "" ||
            typeof a !== "string" ||
            a.trim() === ""
          ) {
            errors.push(
              `meta.faq[${i}] must be { q: "…", a: "…" } with both non-empty`,
            );
            return;
          }
          // Plain text on purpose: the schema string and the rendered string
          // have to be byte-identical, and a markdown link would render as
          // literal brackets in the <dd>.
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
        if (!has("Faq")) {
          errors.push(
            "meta.faq is set but the body never places <Faq /> — the markup would describe questions the page doesn't show",
          );
        }
      }
    } else if (has("Faq")) {
      errors.push("body places <Faq /> but meta.faq is missing");
    }

    const allowedKeys = new Set([
      "title",
      "titleTag",
      "description",
      "ogTitle",
      "ogDescription",
      "ogStat",
      "summary",
      "preview",
      "cta",
      "keywords",
      "published",
      "updated",
      "sources",
      "dataset",
      "faq",
      "noindex",
    ]);
    for (const k of Object.keys(meta)) {
      if (!allowedKeys.has(k)) warnings.push(`meta has unexpected key "${k}"`);
    }
  }

  // ── body ──────────────────────────────────────────────────────────────────
  if (/^#[ \t]/m.test(body)) {
    errors.push(
      "body contains an H1 (`# …`); start sections at `##` (the page adds the H1)",
    );
  }

  const headings = extractHeadings(mdxBody(src));
  if (headings.length === 0) warnings.push("no `##` section headings found");

  // <Faq /> and <Fuentes /> render their own heading, with the id the table of
  // contents links to. A `##` above them that slugs to the same id is that
  // heading written twice — two elements sharing one DOM id, and the contents
  // entry landing on the empty one.
  for (const [tag, sec] of [
    ["Faq", FAQ_SECTION],
    ["Fuentes", SOURCES_SECTION],
  ] as const) {
    if (has(tag) && headings.some((h) => h.id === sec.id)) {
      errors.push(
        `body writes its own "${sec.text}" heading above <${tag} /> — the component renders that heading itself, so the page shows it twice and two elements share id="${sec.id}"`,
      );
    }
  }

  // ── links resolve ─────────────────────────────────────────────────────────
  /** Resolve a site-relative path into the section page it names. Returns the
   * section index and the path within it, or a message saying why not. */
  const resolve = (
    target: string,
  ): { index: SectionIndex; to: string } | { problem: string } => {
    for (const index of world.sections.values()) {
      const base = `/${index.cfg.base}/`;
      if (!target.startsWith(base)) continue;
      const to = target.slice(base.length);
      if (!index.paths.has(to)) {
        return { problem: `no such ${index.cfg.noun}` };
      }
      return { index, to };
    }
    return { problem: "not a section path" };
  };

  const sectionAlternation = [...world.sections.values()]
    .map((index) => index.cfg.base)
    .join("|");
  const seenLinks = new Set<string>();
  for (const m of body.matchAll(
    new RegExp(`\\]\\((/(?:guias|${sectionAlternation})/[^)\\s]+)\\)`, "g"),
  )) {
    const [target, anchor] = m[1].replace(/\/(?=#|$)/, "").split("#");
    if (target.startsWith("/guias/")) {
      const slug = target.slice("/guias/".length);
      if (slug && !world.guides.has(slug)) {
        errors.push(`broken internal link → ${target} (no such guide)`);
      }
      continue;
    }
    const hit = resolve(target);
    if ("problem" in hit) {
      errors.push(`broken internal link → ${target} (${hit.problem})`);
      continue;
    }
    if (anchor && !hit.index.anchors.get(hit.to)?.has(anchor)) {
      errors.push(
        `broken anchor → ${target}#${anchor} (that page has no section with that id)`,
      );
    }
    if (hit.index.cfg.id === cfg.id && hit.to === at) {
      warnings.push("links to itself");
    } else {
      seenLinks.add(`${hit.index.cfg.id}/${hit.to}`);
    }
  }
  r.links = [...seenLinks];

  // ── components must be registered ─────────────────────────────────────────
  for (const m of world.components.error
    ? []
    : body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    if (!world.components.all.has(m[1]) && !local.all.has(m[1])) {
      errors.push(
        `unknown component <${m[1]}/> (not imported by this page or registered globally)`,
      );
    }
  }

  // <PaginaRelacionada href="…"> names a page by its site-relative path, and an
  // unknown one throws at build time — caught here with the fix named instead.
  for (const m of body.matchAll(/<PaginaRelacionada\b([^>]*)>/g)) {
    const prop = /href\s*=\s*"([^"]*)"/.exec(m[1]);
    if (!prop) {
      errors.push(
        '<PaginaRelacionada> needs an href="/estadisticas/…" or href="/investigacion/…" prop',
      );
      continue;
    }
    const hit = resolve(prop[1]);
    if ("problem" in hit) {
      errors.push(`<PaginaRelacionada href="${prop[1]}" /> — ${hit.problem}`);
    }
  }

  // ── the figure comes first (AUTHORING §4) ─────────────────────────────────
  // The reader came for the number; every screen of prose above it is a screen
  // they scroll past. Measured in `##` sections rather than characters, which is
  // what the spec is written in.
  const figure = [...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].find((m) =>
    local.figures.has(m[1]),
  );
  if (!figure) {
    warnings.push(
      "no figure component — these pages publish numbers, and the prose is there to make them readable",
    );
  } else {
    const above = [...body.slice(0, figure.index).matchAll(/^##[ \t]/gm)]
      .length;
    if (above > 3) {
      warnings.push(
        `the first figure sits below ${above} \`##\` sections — put it by the third (AUTHORING §4)`,
      );
    }
  }

  // ── <Subpaginas /> ────────────────────────────────────────────────────────
  // It renders the child list, and nothing on a page that has none.
  if (self.hubs.has(at) && !has("Subpaginas")) {
    warnings.push(
      "this page has child pages but never places <Subpaginas /> — nothing on it links to them",
    );
  }
  if (!self.hubs.has(at) && has("Subpaginas")) {
    warnings.push(
      "places <Subpaginas /> but has no child pages — it renders nothing",
    );
  }

  // ── no current values typed into the prose (AUTHORING §5) ─────────────────
  // The prose is written once and the data is refreshed every month. Only
  // amounts are flagged, not every number: "un alquiler que sube 30 % en un año
  // en el que todo sube 30 %" is an explanation and stays true, while a price
  // in the text is wrong by the next release.
  for (const m of body.matchAll(
    /(?:US\$|\$)\s?\d[\d.,]*|\b\d{1,3}(?:\.\d{3})+\s*(?:pesos|d[oó]lares)/gi,
  )) {
    warnings.push(
      `"${m[0].trim()}" is a current value typed into the prose — it goes stale on the next refresh; put it in a component that reads the data`,
    );
  }

  // The last moment the reader is on the page, and the only one where they've
  // already been given what they came for. A page that ends on its sources has
  // spent a visitor from search and asked them for nothing.
  const closing = /<ClosingCta\b([^>]*)>([\s\S]*?)<\/ClosingCta>/.exec(body);
  if (!closing) {
    warnings.push(
      `no <ClosingCta> — a ${cfg.noun} should end its prose with one (AUTHORING §4)`,
    );
  } else if (!/\btitle\s*=/.test(closing[1])) {
    warnings.push(
      '<ClosingCta> without a title="…" — it falls back to generic copy',
    );
  } else if (closing[2].trim() === "") {
    warnings.push(
      "<ClosingCta> has no body copy — write the two page-specific sentences",
    );
  }

  return r;
}

/** A link into a `noindex` page is a link to a page nothing else lists and
 * search engines are told to skip. Runs over every section at once, because a
 * research page linking into a statistics draft is exactly the case one
 * section's own pass can't see. */
function crossCheck(reports: Map<string, PageReport[]>): void {
  const drafts = new Set<string>();
  for (const [id, list] of reports) {
    for (const r of list) if (r.noindex) drafts.add(`${id}/${r.at}`);
  }
  if (drafts.size === 0) return;
  for (const list of reports.values()) {
    for (const r of list) {
      if (r.noindex) continue;
      for (const target of r.links) {
        if (drafts.has(target)) {
          r.warnings.push(`links to /${target}, which is noindex`);
        }
      }
    }
  }
}

/** Slugs of the guides, for checking cross-section links. Read as filenames
 * rather than imported: `guides.ts` is `server-only`. */
const guideSlugs = (): Set<string> =>
  new Set(
    readdirSync(path.join(CONTENT_DIR, "guias"))
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.replace(/\.mdx$/, "")),
  );

type Collected = {
  cfg: SectionConfig;
  registry: Report;
  files: string[];
  pathOf: (file: string) => string;
  index: SectionIndex;
  fatal?: Report;
};

/** Parse one section far enough to know its pages and their anchors. Done for
 * every section before any page is validated, because link resolution crosses
 * between them. */
function survey(cfg: SectionConfig): Collected {
  const dir = dirOf(cfg.id);
  const empty: SectionIndex = {
    cfg,
    paths: new Set(),
    anchors: new Map(),
    hubs: new Set(),
  };

  let files: string[];
  try {
    files = mdxFiles(dir);
  } catch {
    return {
      cfg,
      registry: newReport(`${cfg.id}/`),
      files: [],
      pathOf: (f) => f,
      index: empty,
      fatal: { ...newReport(`${cfg.id}/`), errors: [`cannot read ${dir}`] },
    };
  }
  if (files.length === 0) {
    return {
      cfg,
      registry: newReport(`${cfg.id}/`),
      files: [],
      pathOf: (f) => f,
      index: empty,
      fatal: { ...newReport(`${cfg.id}/`), errors: ["no .mdx pages found"] },
    };
  }

  const registrySrc = readFileSync(path.join(dir, "pages.ts"), "utf8");
  const { entries, error } = parseEntries(registrySrc);
  const registry = error
    ? { ...newReport(`${cfg.id}/pages.ts`), errors: [error] }
    : validateRegistry(cfg, entries, files);

  // An unregistered `.mdx` is already an error above; it's still validated, at
  // the path it would have, so one run reports everything wrong with it.
  const pathOf = (file: string): string =>
    entries.find((e) => e.file === file)?.slug.join("/") ??
    file.replace(/\.mdx$/, "");

  const paths = new Set(files.map(pathOf));
  const index: SectionIndex = {
    cfg,
    paths,
    anchors: new Map(
      files.map((file) => {
        const body = mdxBody(readFileSync(path.join(dir, file), "utf8"));
        const ids = new Set(extractHeadings(body).map((h) => h.id));
        // Both blocks are sections of the page with no `##` of their own.
        if (/<Faq[\s/>]/.test(body)) ids.add(FAQ_SECTION.id);
        if (/<Fuentes[\s/>]/.test(body)) ids.add(SOURCES_SECTION.id);
        return [pathOf(file), ids];
      }),
    ),
    hubs: new Set(
      [...paths].filter((p) => [...paths].some((o) => o.startsWith(`${p}/`))),
    ),
  };

  return { cfg, registry, files, pathOf, index };
}

/** Every registry section's reports, cross-checked against each other. `only`
 * narrows which sections are *reported*; every one is still surveyed, so a link
 * from the reported section into another still resolves.
 *
 * The shared title/description collision pass runs later, over every section at
 * once — see `validate-content.ts`. */
export function collectSections(
  only?: readonly string[],
): { name: string; reports: Report[] }[] {
  const surveyed = SECTION_CONFIGS.map(survey);
  const components = registeredComponents();
  const world: World = {
    components,
    sections: new Map(surveyed.map((s) => [s.cfg.id, s.index])),
    guides: guideSlugs(),
  };

  const pageReports = new Map<string, PageReport[]>();
  for (const s of surveyed) {
    pageReports.set(
      s.cfg.id,
      s.files.map((f) => validatePage(s.cfg, f, s.pathOf(f), world)),
    );
  }
  crossCheck(pageReports);

  return surveyed
    .filter((s) => !only || only.includes(s.cfg.id))
    .map((s) => {
      if (s.fatal) return { name: s.cfg.name, reports: [s.fatal] };
      const registry = s.registry;
      // Reported against the first section asked for: it is a fact about
      // mdx-components.tsx, not about any one section, but it has to land
      // somewhere a reader will see it.
      if (components.error && !registry.errors.includes(components.error)) {
        registry.errors.push(components.error);
      }
      return {
        name: s.cfg.name,
        reports: [registry, ...(pageReports.get(s.cfg.id) ?? [])],
      };
    });
}

if (isEntrypoint(import.meta.url)) {
  finish(collectSections());
}
