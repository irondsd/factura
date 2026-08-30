import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS, type ContentSection } from "../types";
import { componentsForSection } from "./definitions";
import { CONTEXT_BOUND_COMPONENT_NAMES } from "./manifest";

// The failure this file exists for renders as *nothing*.
//
// Four components take no properties from the author: `<Faq />`,
// `<RelatedGuides />`, `<Fuentes />` and `<Subpaginas />`. The author writes a
// bare tag; the route supplies the data through `contentComponents({…})`. The
// manifest binds all four to a no-op, because with no article around them there
// is nothing to show — which means a route that *forgets* one produces a page
// that validates, compiles, renders and silently omits a block the author asked
// for. No error, no warning, no diagnostic; just a missing section that only a
// person reading the published page would notice.
//
// Widening a component's `sections` is a one-line edit in `definitions.ts` and
// does not touch any route, so the two drift apart in exactly the direction
// nothing catches. This test is the tripwire: for each section, every
// context-bound component the manifest allows there must be bound by every
// route that renders that section.
//
// It reads the route sources as text. That is not elegant, and it is
// deliberate: these routes are Next server components that load categories,
// media, authors and related pages before they bind anything, so calling one in
// a unit test means standing up a database to answer a question about a
// keyword. The property being checked — "the name appears as a binding key" —
// is one the source text can answer honestly.

const ROOT = join(__dirname, "..", "..", "..");

/** Every route that renders a stored body, and the sections it is responsible
 * for. `SectionArticle` is a component rather than a route, but it is where
 * statistics and research articles bind their components, which is what
 * matters here. */
const RENDERERS: { file: string; sections: readonly ContentSection[] }[] = [
  {
    file: "src/app/(site)/[lang]/guias/[slug]/page.tsx",
    sections: ["guias"],
  },
  {
    file: "src/app/(site)/[lang]/noticias/[slug]/page.tsx",
    sections: ["noticias"],
  },
  {
    file: "src/components/section/SectionArticle.tsx",
    sections: ["estadisticas", "investigaciones"],
  },
  {
    // The private preview promises to be the public page. A component it fails
    // to bind is a block an editor approves without ever having seen it.
    file: "src/app/(cms)/cms/[section]/preview/[id]/page.tsx",
    sections: CONTENT_SECTIONS,
  },
];

const sourceOf = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("context-bound components are bound by the routes that render them", () => {
  it("reads every renderer it names", () => {
    // Guards the guard: a moved or renamed route would otherwise turn every
    // assertion below into a check of an empty string.
    for (const { file } of RENDERERS) {
      expect(sourceOf(file).length, file).toBeGreaterThan(500);
      expect(sourceOf(file), file).toContain("contentComponents(");
    }
  });

  const cases = RENDERERS.flatMap(({ file, sections }) =>
    sections.flatMap((section) =>
      CONTEXT_BOUND_COMPONENT_NAMES.filter((name) =>
        componentsForSection(section).includes(name),
      ).map((name) => [file, section, name] as const),
    ),
  );

  it("has something to check", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("%s (%s) binds <%s />", (file, _section, name) => {
    // `Name:` is how a binding is written in the object passed to
    // `contentComponents()`. Matching the key rather than the whole expression
    // keeps the test about the omission it is looking for, not about how the
    // block happens to be built.
    expect(sourceOf(file)).toMatch(new RegExp(`\\b${name}:\\s`));
  });
});

describe("the list of context-bound components is the real one", () => {
  it("names only components the manifest actually registers", () => {
    for (const name of CONTEXT_BOUND_COMPONENT_NAMES) {
      const sections = CONTENT_SECTIONS.filter((section) =>
        componentsForSection(section).includes(name),
      );
      expect(sections.length, `${name} is registered nowhere`).toBeGreaterThan(
        0,
      );
    }
  });

  it("does not include a component that takes properties", () => {
    // `PaginaRelacionada` is the near miss: it is also article furniture, but
    // the author writes its `href`, so a route that does not bind it still
    // renders the real card. It must not be on this list, or a route would be
    // required to override a component that works.
    expect(CONTEXT_BOUND_COMPONENT_NAMES).not.toContain(
      "PaginaRelacionada" as never,
    );
  });
});
