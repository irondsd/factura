import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { markdownComponents } from "@/mdx-components";
import { compileContent, contentComponents } from "../render/renderContent";
import {
  CONTENT_COMPONENT_NAMES,
  CONTENT_COMPONENTS,
  componentsForSection,
  isContentComponentName,
} from "./manifest";
import { SECTION_COMPONENT_NAMES } from "./sectionDefinitions";

// Two things this file guards.
//
// First, parity with `src/mdx-components.tsx`: until Phase 7 removes the
// filesystem path, the same guide source has to produce the same page whichever
// one renders it. A component the global map offers but the manifest does not
// register would validate as "unknown" the moment its guide is imported.
//
// Second, that the manifest's binding *is* the one that renders — the entry for
// a component whose global-map form carries article furniture has to carry it
// too, or the CMS preview shows a page the public site will not.

/** Names the global MDX map exposes that belong to guides. `Fuentes` and
 * `Subpaginas` are the statistics/research sections' and arrive with section
 * 12. `PaginaRelacionada` is registered separately because the CMS can now
 * use its statistics/research card from guides as well. */
const GUIDE_NAMES_IN_GLOBAL_MAP = [
  "ClosingCta",
  "CtaButton",
  "CtaRow",
  "DemoCta",
  "SignupCta",
  "ProbarCta",
  "TrustBlock",
  "Faq",
  "RelatedGuides",
];

describe("parity with the filesystem MDX map", () => {
  it("registers every guide component the global map offers", () => {
    for (const name of GUIDE_NAMES_IN_GLOBAL_MAP) {
      expect(isContentComponentName(name)).toBe(true);
      expect(componentsForSection("guias")).toContain(name);
    }
  });

  it("the global map really does offer them", () => {
    // Guards the guard: a rename in `mdx-components.tsx` would otherwise leave
    // the list above checking nothing.
    for (const name of GUIDE_NAMES_IN_GLOBAL_MAP) {
      expect(markdownComponents).toHaveProperty(name);
    }
  });

  it("registers InflacionChart, which the global map deliberately does not", () => {
    // The one component guides reach by a local `import` today. Registering it
    // centrally is what lets the importer strip those eight import lines.
    expect(componentsForSection("guias")).toContain("InflacionChart");
    expect(markdownComponents).not.toHaveProperty("InflacionChart");
  });

  it("does not register another section's components for guides", () => {
    for (const name of ["Fuentes", "Subpaginas"]) {
      expect(componentsForSection("guias")).not.toContain(name);
    }
  });

  it("registers the related statistics card for guides", () => {
    expect(componentsForSection("guias")).toContain("PaginaRelacionada");
  });
});

describe("manifest bindings render what the site renders", () => {
  const render = async (
    body: string,
    overrides = {},
    section: "guias" | "estadisticas" = "guias",
  ) => {
    const Content = await compileContent(body, section);
    return renderToHtml(
      createElement(Content, { components: contentComponents(overrides) }),
    );
  };

  it("renders a chart from the manifest, with no import in the body", async () => {
    const html = await render('<InflacionChart chart="luz-y-gas" />\n');
    expect(html).toContain("<svg");
  });

  it("keeps the article rhythm on the trust block", async () => {
    // `mdx-components.tsx` binds `className="my-10"`; a bare component here
    // would render the same content with different spacing.
    const html = await render("<TrustBlock />\n");
    expect(html).toContain("my-10");
  });

  it("renders nothing for a context-bound component with no article", async () => {
    const html = await render("<Faq />\n<RelatedGuides />\n");
    expect(html).not.toContain("undefined");
    expect(html.trim()).toBe("");
  });

  it("lets the article route bind the context-bound components", async () => {
    const html = await render("<Faq />\n", {
      Faq: () => createElement("p", null, "preguntas de esta guía"),
    });
    expect(html).toContain("preguntas de esta guía");
  });

  it("applies the site's markdown styling to prose", async () => {
    // The paper aesthetic lives in the global map. A database page that skipped
    // it would render unstyled HTML.
    const html = await render("## Una sección\n\nUn párrafo.\n");
    expect(html).toContain("font-display");
    expect(html).toContain("font-mono");
  });

  it("renders every registered component without throwing", async () => {
    const samples: Record<string, string> = {
      ClosingCta: '<ClosingCta title="Título">\n\nCopia.\n\n</ClosingCta>',
      ProbarCta: '<ProbarCta vendor="Edesur">\n\nCopia.\n\n</ProbarCta>',
      CtaButton: '<CtaButton href="/demo">Ver</CtaButton>',
      CtaRow: "<CtaRow>\n\n<DemoCta />\n\n</CtaRow>",
      DemoCta: "<DemoCta />",
      SignupCta: "<SignupCta />",
      InflacionChart: '<InflacionChart chart="expensas" />',
      TrustBlock: "<TrustBlock />",
      Faq: "<Faq />",
      RelatedGuides: "<RelatedGuides />",
      Fuentes: "<Fuentes />",
      Subpaginas: "<Subpaginas />",
      PaginaRelacionada:
        '<PaginaRelacionada href="/estadisticas/alquiler-caba">Copia.</PaginaRelacionada>',
      IpcViviendaChart: '<IpcViviendaChart region="gba" variacion="mensual" />',
      ResumenRegion: '<ResumenRegion region="gba" />',
      ...Object.fromEntries(
        SECTION_COMPONENT_NAMES.filter(
          (name) =>
            ![
              "ClosingCta",
              "PaginaRelacionada",
              "IpcViviendaChart",
              "ResumenRegion",
            ].includes(name),
        ).map((name) => [name, `<${name} />`]),
      ),
    };
    expect(Object.keys(samples).sort()).toEqual(
      [...CONTENT_COMPONENT_NAMES].sort(),
    );
    for (const [name, source] of Object.entries(samples)) {
      await expect(
        render(
          `${source}\n`,
          name === "PaginaRelacionada" ? { PaginaRelacionada: () => null } : {},
          (
            [...SECTION_COMPONENT_NAMES, "Fuentes", "Subpaginas"] as string[]
          ).includes(name)
            ? "estadisticas"
            : "guias",
        ),
        `<${name}> should render`,
      ).resolves.toBeTypeOf("string");
    }
  });
});

describe("manifest shape", () => {
  it("marks container components as containers", () => {
    // Every one of these is written with children in a real guide; declaring
    // one a leaf would reject 43 guides at import.
    for (const name of ["ClosingCta", "ProbarCta", "CtaRow", "CtaButton"]) {
      expect(CONTENT_COMPONENTS[name as "ClosingCta"].kind).toBe("container");
    }
  });

  it("marks the bare-tag components as leaves", () => {
    for (const name of [
      "InflacionChart",
      "TrustBlock",
      "Faq",
      "RelatedGuides",
    ]) {
      expect(CONTENT_COMPONENTS[name as "TrustBlock"].kind).toBe("leaf");
    }
  });
});
