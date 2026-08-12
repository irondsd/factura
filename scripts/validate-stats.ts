#!/usr/bin/env bun
/**
 * Validates the statistics pages in `src/content/estadisticas` against the
 * authoring format (see `src/content/estadisticas/AUTHORING.md`). Mirrors the
 * `StatsMeta` type in `src/content/estadisticas/pages.ts`.
 *
 * Run: `bun scripts/validate-stats.ts`  (or `npm run validate:stats`)
 * Exit code is 1 if any ERROR is found (warnings don't fail the run).
 *
 * The guides' validator is the model, but the section differs in two ways that
 * shape this file:
 *
 *  - **A page's URL is a path, and the set of pages is an explicit registry.**
 *    So there are two ways to ship a page nobody can reach — an `.mdx` missing
 *    from `ENTRIES`, or an entry whose `file`/`load` point at a different page's
 *    source — and both are checked here rather than by the build, which happily
 *    renders whatever the registry names.
 *  - **A page publishes a dataset.** `meta.sources` and `meta.dataset` feed the
 *    `Dataset` structured data as well as the visible sources block, so the
 *    checks around them are about the markup and the page agreeing.
 */
import { readdirSync, readFileSync } from "node:fs";
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

const STATS_DIR = path.join(CONTENT_DIR, "estadisticas");
const REGISTRY = path.join(STATS_DIR, "pages.ts");
const MDX_COMPONENTS = path.join(CONTENT_DIR, "../mdx-components.tsx");

/** Slugs of the guides, for checking cross-section links. Read as filenames
 * rather than imported: `guides.ts` is `server-only`. */
const guideSlugs = (): Set<string> =>
  new Set(
    readdirSync(path.join(CONTENT_DIR, "guias"))
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.replace(/\.mdx$/, "")),
  );

// ── what `src/mdx-components.tsx` registers ─────────────────────────────────
// Read out of the file rather than listed here: this is the set of capitalized
// JSX a page can use without crashing the build, and a hand-kept copy of it
// would go stale the first time a chart is added.

function registeredComponents(): {
  all: Set<string>;
  figures: Set<string>;
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

  // A "figure" is anything imported from components/estadisticas — every one of
  // them draws or tabulates the dataset — minus the one that doesn't:
  // <PaginaRelacionada /> is a link card. Used only for the advisory about how
  // far down the page the first figure sits, so a miss costs a warning.
  const figures = new Set<string>();
  for (const m of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*"@\/components\/estadisticas\/[^"]*"/g,
  )) {
    for (const name of m[1].split(",")) {
      const n = name.trim();
      if (n && n !== "PaginaRelacionada") figures.add(n);
    }
  }
  // If the parse ever breaks, say so once instead of calling every component on
  // every page unregistered.
  const error =
    all.size < 10
      ? `only ${all.size} components parsed out of ${path.basename(MDX_COMPONENTS)} — the \`const components: MDXComponents = { … }\` map is what this validator reads`
      : undefined;
  return { all, figures, error };
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

/** Pull `ENTRIES` out of `pages.ts` textually. The module can't be imported
 * here: it's `server-only` and its `load` thunks are MDX imports only a bundler
 * can resolve. */
function parseEntries(src: string): { entries: Entry[]; error?: string } {
  const marker = src.indexOf("const ENTRIES: Entry[] =");
  // Not `indexOf("[")` from the marker — that finds the one in `Entry[]`.
  const open = marker === -1 ? -1 : src.indexOf("[", src.indexOf("=", marker));
  const end = open === -1 ? -1 : matchBrace(src, open);
  if (end === -1) {
    return {
      entries: [],
      error:
        "cannot find `const ENTRIES: Entry[] = [ … ]` — this validator parses it textually, so keep the declaration in that shape",
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

/** Every `.mdx` under the section, as a path relative to it ("gba.mdx",
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
function validateRegistry(entries: Entry[], files: string[]): Report {
  const r = newReport("estadisticas/pages.ts");
  const { errors, warnings } = r;

  const known = new Set(entries.map((e) => e.slug.join("/")));
  const onDisk = new Set(files);
  const seen = new Set<string>();

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
    // links to a 404. `assertHubs` in pages.ts throws on this at build time;
    // catching it here names the fix instead of the stack trace.
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
  /** URL path under /estadisticas. */
  at: string;
  noindex: boolean;
  /** Paths of the other statistics pages this one links to. */
  links: string[];
};

type Section = {
  components: ReturnType<typeof registeredComponents>;
  /** Registered page paths, for link resolution. */
  paths: Set<string>;
  /** Page path → the heading ids on it, for `#anchor` links. */
  anchors: Map<string, Set<string>>;
  /** Page path → whether it has child pages. */
  hubs: Set<string>;
  guides: Set<string>;
};

function validatePage(file: string, at: string, section: Section): PageReport {
  const r: PageReport = {
    ...newReport(`estadisticas/${file}`),
    at,
    noindex: false,
    links: [],
  };
  const { errors, warnings } = r;
  const src = readFileSync(path.join(STATS_DIR, file), "utf8");

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

    if (meta.noindex !== undefined && meta.noindex !== true) {
      errors.push("meta.noindex, if set, must be exactly `true` (or omitted)");
    }
    r.noindex = meta.noindex === true;

    // The rendered <title>. `statsMetadata` sets it absolute — no "— Factura"
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
    // guides. This section uses the pair the other way round on purpose: the
    // <h1> is the conversational headline ("Cuánto sale alquilar en CABA") and
    // the <title> is the phrase people search ("Precio de alquileres en CABA
    // por barrio y comuna"), which is often the longer of the two.
    //
    // The social card sets `meta.title` (never the titleTag) at a size stepped
    // down by length, bottoming out at 58px — which is three lines, and there
    // is no fourth. See `headlineSize` in the /og route.
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
    // Same <TopCta /> as a guide, in this section's wider column. Measured in
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
    // Against `rendered`, not `title`: this section puts the search phrase in
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
    // declared a source it doesn't show is the markup/page mismatch this
    // section is otherwise careful to make impossible.
    const sources = meta.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      errors.push(
        "meta.sources must be a non-empty array of { label, href, note? } — a statistics page cites where its numbers come from",
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
        "meta.dataset must be an object describing the series — see StatsMeta in pages.ts",
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
  const seenLinks = new Set<string>();
  for (const m of body.matchAll(/\]\((\/(?:estadisticas|guias)\/[^)\s]+)\)/g)) {
    const [target, anchor] = m[1].replace(/\/(?=#|$)/, "").split("#");
    if (target.startsWith("/guias/")) {
      const slug = target.slice("/guias/".length);
      if (slug && !section.guides.has(slug)) {
        errors.push(`broken internal link → ${target} (no such guide)`);
      }
      continue;
    }
    const to = target.slice("/estadisticas/".length);
    if (to === "") continue; // the section index
    if (!section.paths.has(to)) {
      errors.push(`broken internal link → ${target} (no such statistics page)`);
      continue;
    }
    if (anchor && !section.anchors.get(to)?.has(anchor)) {
      errors.push(
        `broken anchor → ${target}#${anchor} (that page has no section with that id)`,
      );
    }
    if (to === at) warnings.push("links to itself");
    else seenLinks.add(to);
  }
  r.links = [...seenLinks];

  // ── components must be registered ─────────────────────────────────────────
  for (const m of section.components.error
    ? []
    : body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    if (!section.components.all.has(m[1])) {
      errors.push(
        `unknown component <${m[1]}/> (not registered in mdx-components.tsx)`,
      );
    }
  }

  // <PaginaRelacionada slug="…"> names a page by slug, and an unknown one
  // renders a card pointing at a 404.
  for (const m of body.matchAll(/<PaginaRelacionada\b([^>]*)>/g)) {
    const prop = /slug\s*=\s*"([^"]*)"/.exec(m[1]);
    if (!prop) {
      errors.push('<PaginaRelacionada> needs a slug="…" prop');
    } else if (!section.paths.has(prop[1])) {
      errors.push(
        `<PaginaRelacionada slug="${prop[1]}" /> is not a statistics page`,
      );
    }
  }

  // ── the figure comes first (AUTHORING §4) ─────────────────────────────────
  // The reader came for the number; every screen of prose above it is a screen
  // they scroll past. Measured in `##` sections rather than characters, which is
  // what the spec is written in.
  const figure = [...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].find((m) =>
    section.components.figures.has(m[1]),
  );
  if (!figure) {
    warnings.push(
      "no figure component — a statistics page publishes a series, and the prose is there to make it readable",
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
  if (section.hubs.has(at) && !has("Subpaginas")) {
    warnings.push(
      "this page has child pages but never places <Subpaginas /> — nothing on it links to them",
    );
  }
  if (!section.hubs.has(at) && has("Subpaginas")) {
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

  // A <ClosingCta> is optional here (the CABA pages end on <PaginaRelacionada />
  // instead), but a bare one wastes the last moment the reader is on the page.
  const closing = /<ClosingCta\b([^>]*)>([\s\S]*?)<\/ClosingCta>/.exec(body);
  if (closing && !/\btitle\s*=/.test(closing[1])) {
    warnings.push(
      '<ClosingCta> without a title="…" — it falls back to generic copy',
    );
  } else if (closing && closing[2].trim() === "") {
    warnings.push(
      "<ClosingCta> has no body copy — write the two page-specific sentences",
    );
  }

  return r;
}

/** A link into a `noindex` page is a link to a page nothing else lists and
 * search engines are told to skip. */
function crossCheck(reports: PageReport[]): void {
  const drafts = new Set(reports.filter((r) => r.noindex).map((r) => r.at));
  if (drafts.size === 0) return;
  for (const r of reports) {
    if (r.noindex) continue;
    for (const target of r.links) {
      if (drafts.has(target)) {
        r.warnings.push(`links to /estadisticas/${target}, which is noindex`);
      }
    }
  }
}

/** Every statistics page's report, plus the registry's, cross-checked within
 * the section. The shared title/description collision pass runs later, over
 * every section at once. */
export function collectStats(): Report[] {
  let files: string[];
  try {
    files = mdxFiles(STATS_DIR);
  } catch {
    return [
      { ...newReport("estadisticas/"), errors: [`cannot read ${STATS_DIR}`] },
    ];
  }
  if (files.length === 0) {
    return [{ ...newReport("estadisticas/"), errors: ["no .mdx pages found"] }];
  }

  const components = registeredComponents();
  const registrySrc = readFileSync(REGISTRY, "utf8");
  const { entries, error } = parseEntries(registrySrc);
  const registry = error
    ? { ...newReport("estadisticas/pages.ts"), errors: [error] }
    : validateRegistry(entries, files);
  if (components.error) registry.errors.push(components.error);

  // An unregistered `.mdx` is already an error above; it's still validated, at
  // the path it would have, so one run reports everything wrong with it.
  const pathOf = (file: string): string =>
    entries.find((e) => e.file === file)?.slug.join("/") ??
    file.replace(/\.mdx$/, "");

  const paths = new Set(files.map(pathOf));
  const section: Section = {
    components,
    paths,
    anchors: new Map(
      files.map((file) => {
        const body = mdxBody(readFileSync(path.join(STATS_DIR, file), "utf8"));
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
    guides: guideSlugs(),
  };

  const reports = files.map((f) => validatePage(f, pathOf(f), section));
  crossCheck(reports);
  return [registry, ...reports];
}

if (isEntrypoint(import.meta.url)) {
  finish([{ name: "Estadísticas", reports: collectStats() }]);
}
