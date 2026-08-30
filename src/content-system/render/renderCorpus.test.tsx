import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import {
  CONTENT_COMPONENT_DEFINITIONS,
  type ContentComponentName,
} from "../components/definitions";
import {
  COMPONENT_SAMPLES,
  DATABASE_BACKED_COMPONENTS,
} from "../components/samples";
import { CI_CONTENT_FIXTURES } from "../repository/ci-fixtures";
import { CONTENT_SECTIONS, type ContentSection } from "../types";
import { validateContentDocument } from "../validation";
import {
  assertContentRenders,
  compileContent,
  ContentGrammarError,
  contentComponents,
} from "./renderContent";

// "Everything the CMS can save renders."
//
// The rest of the validation suite proves what content is *refused*. This file
// is the other half, and it is the one the editorial workflow actually rests
// on: content now lives in the database, so a page that validates and then
// throws at render is a live 500 that no deploy introduced and no test run
// would have caught. Nothing here asserts about styling or copy — the claim is
// only that a body an author can legally write turns into HTML.
//
// Three corpora, for three different ways that can break:
//
//   1. every registered component, in every section that allows it — the
//      manifest's promise that a name an author may write resolves to
//      something renderable;
//   2. the markdown constructs a body is made of, which no component test
//      touches because they are the *document*, not the components in it;
//   3. the CI fixtures, which are whole documents and the closest thing the
//      repository has to real editorial data.
//
// `PaginaRelacionada` is the one component bound to a stub: it resolves its
// card from the target page's own registry entry, which is a database read.
// Everything else renders for real, exactly as a public route renders it.

const stubs = Object.fromEntries(
  DATABASE_BACKED_COMPONENTS.map((name) => [name, () => null]),
);

const render = (body: string, section: ContentSection) =>
  compileContent(body, section).then((Content) =>
    renderToHtml(
      createElement(Content, { components: contentComponents(stubs) }),
    ),
  );

const names = Object.keys(
  CONTENT_COMPONENT_DEFINITIONS,
) as ContentComponentName[];

describe("every registered component renders in every section that allows it", () => {
  // The existing manifest test renders each component once, in one section.
  // A component is registered per *section*, though, and adding a section to a
  // definition is a one-line edit — so the pair is what has to be covered.
  const pairs = names.flatMap((name) =>
    CONTENT_COMPONENT_DEFINITIONS[name].sections.map(
      (section) => [name, section] as const,
    ),
  );

  it("covers every registered pair", () => {
    // Guards the guard: if this drops to zero, or stops growing when a
    // component is added, the loop below is testing nothing.
    expect(pairs.length).toBeGreaterThanOrEqual(names.length);
    for (const name of names) {
      expect(
        pairs.some(([candidate]) => candidate === name),
        `${name} has no section`,
      ).toBe(true);
    }
  });

  it.each(pairs)("<%s /> in %s", async (name, section) => {
    const html = await render(`${COMPONENT_SAMPLES[name]}\n`, section);
    expect(html).toBeTypeOf("string");
    // MDX renders an unresolved name as the literal string "undefined" rather
    // than throwing, which is the failure mode a smoke test misses.
    expect(html).not.toContain("undefined");
  });
});

describe("the markdown a body is made of", () => {
  // These are documents, not components. Every one of them is written in a
  // real guide today, and each has been a rendering bug in some MDX pipeline:
  // GFM tables need the plugin, footnotes and task lists need it too, nested
  // containers are where a renderer chokes, and a hard break inside a table
  // cell is the kind of thing that parses and then does not render.
  const shapes: Record<string, string> = {
    headings: "## Una sección\n\n### Una subsección\n\n#### Más abajo\n",
    prose: "Un párrafo con **negrita**, *cursiva*, `código` y ~~tachado~~.\n",
    "nested lists":
      "- uno\n  - uno punto uno\n    - más adentro\n- dos\n\n1. primero\n2. segundo\n",
    "task list": "- [x] hecho\n- [ ] pendiente\n",
    "gfm table":
      "| Sección | Qué revisar |\n| ------- | ----------- |\n| Total | El importe |\n| Consumo | Los kWh |\n",
    "table with formatting":
      "| Cargo | Detalle |\n| --- | --- |\n| **Fijo** | `$1.234` con [enlace](/guias/edesur) |\n",
    blockquote: "> Una cita del texto oficial.\n>\n> Con dos párrafos.\n",
    "fenced code": "```text\nun bloque\ncon dos líneas\n```\n",
    "indented code": "    un bloque indentado\n",
    "thematic break": "Antes.\n\n---\n\nDespués.\n",
    footnote: "Un dato[^1].\n\n[^1]: La aclaración.\n",
    "reference link":
      "Ver [el ente][enargas].\n\n[enargas]: https://www.enargas.gob.ar/\n",
    "autolink literal": "Ver https://www.enargas.gob.ar/ para el detalle.\n",
    "escaped brace": "Un literal \\{ en el texto.\n",
    entities: "Menos que &lt;script&gt; y un &amp; suelto.\n",
    "long unicode":
      "Ñandú, ácido, ¿cuánto?, ¡ojo!, «comillas», — raya, 20 m², 1.234,56 $.\n",
    "empty-ish": "Una sola línea.\n",
    "heading with punctuation": "## ¿Cómo leer la boleta? (2026)\n",
    "duplicate headings": "## Total\n\nTexto.\n\n## Total\n\nMás texto.\n",
  };

  const containers: Record<string, string> = {
    "container wrapping prose":
      '<ClosingCta title="Título">\n\nDos frases de cierre.\n\n</ClosingCta>\n',
    "container wrapping a list":
      '<ClosingCta title="Título">\n\n- uno\n- dos\n\n</ClosingCta>\n',
    "container wrapping a table":
      '<ClosingCta title="Título">\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n</ClosingCta>\n',
    "container inside a container":
      '<CtaRow>\n\n<CtaButton href="/demo">Ver</CtaButton>\n\n<DemoCta />\n\n</CtaRow>\n',
    "leaf between paragraphs": "Antes.\n\n<TrustBlock />\n\nDespués.\n",
    "inline component in a sentence":
      'Probá <CtaButton href="/demo">la demo</CtaButton> ahora.\n',
  };

  it.each(
    CONTENT_SECTIONS.flatMap((section) =>
      Object.entries(shapes).map(
        ([label, body]) => [section, label, body] as const,
      ),
    ),
  )("%s: %s", async (section, _label, body) => {
    expect(await render(body, section)).toBeTypeOf("string");
  });

  it.each(Object.entries(containers))("guías: %s", async (_label, body) => {
    expect(await render(body, "guias")).toBeTypeOf("string");
  });

  it("renders a document that uses many of them at once", async () => {
    // The shapes above are each rendered alone, which is not the same as
    // rendering them in one tree — a real page is all of it at once.
    const body = [
      "## Las secciones de la factura",
      "",
      "Un párrafo con **negrita** y un [enlace](/guias/otra).",
      "",
      "| Sección | Qué revisar |",
      "| ------- | ----------- |",
      "| Total | El importe |",
      "",
      "- uno",
      "- dos",
      "",
      "> Una cita.",
      "",
      "<TrustBlock />",
      "",
      "### Un subtítulo",
      "",
      "```text",
      "un bloque",
      "```",
      "",
      "<Faq />",
      "",
      "<Fuentes />",
      "",
      "<RelatedGuides />",
      "",
      '<ClosingCta title="Tu factura, no el promedio">',
      "",
      "Dos frases de cierre.",
      "",
      "</ClosingCta>",
      "",
    ].join("\n");

    const html = await render(body, "guias");
    expect(html).toContain("<table");
    expect(html).toContain("<blockquote");
    expect(html).toContain('id="las-secciones-de-la-factura"');
  });
});

describe("the CI content fixtures", () => {
  // Whole documents rather than snippets, and the ones a production CI build
  // actually renders. If these stop rendering, the build is already broken.
  it.each(CI_CONTENT_FIXTURES.map((f) => [f.section, f] as const))(
    "%s",
    async (_section, fixture) => {
      expect(await render(fixture.body, fixture.section)).toBeTypeOf("string");
    },
  );
});

describe("anything storable is renderable", () => {
  // The contract, stated as a test rather than as a comment.
  //
  // The *publish* gate renders the body itself, so it cannot let an unrenderable
  // page through by construction. The interesting claim is one level down:
  // grammar is the only layer a draft save has to survive, and a draft the
  // editor can save but the preview cannot show is a page nothing warned them
  // about. So the property checked here is grammar acceptance ⇒ renders.
  const document = (body: string, section: ContentSection) => ({
    id: "1",
    section,
    slug: "una-pagina",
    status: "published" as const,
    body,
    title: "Una página de prueba con un título suficientemente largo",
    titleTag: null,
    description:
      "Una descripción de prueba con la longitud que el validador espera de una página publicada, escrita para que la comprobación sea sobre el render.",
    summary: "Un resumen de prueba.",
    cta: "Una llamada a la acción de prueba.",
    canonicalSlug: null,
    parentId: null,
    sortOrder: 0,
    crumb: null,
    metadata: { keywords: [], categories: [], locations: [] },
    publishedAt: "2026-07-12T09:00:00-03:00",
    contentUpdatedAt: "2026-08-09T11:30:00-03:00",
    createdAt: "2026-07-12T09:00:00-03:00",
    updatedAt: "2026-08-09T11:30:00-03:00",
    createdBy: null,
    updatedBy: null,
    lockVersion: 1,
  });

  /** Every sample, paired with a section that actually allows it. */
  const cases = (
    Object.keys(COMPONENT_SAMPLES) as ContentComponentName[]
  ).flatMap((name) =>
    CONTENT_COMPONENT_DEFINITIONS[name].sections.map(
      (section) => [`${COMPONENT_SAMPLES[name]}\n`, section] as const,
    ),
  );

  const prose: (readonly [string, ContentSection])[] = CONTENT_SECTIONS.flatMap(
    (section) =>
      [
        "## Una sección\n\nTexto.\n",
        "| a | b |\n| - | - |\n| 1 | 2 |\n",
        "Ver [el ente](https://www.enargas.gob.ar/).\n",
      ].map((body) => [body, section] as const),
  );

  it.each([...cases, ...prose])(
    "a body the grammar accepts renders: %s (%s)",
    async (body, section) => {
      // Grammar is the layer that runs on *every* save, including a draft's, so
      // it is the one whose acceptance has to imply renderability — a draft the
      // editor can save but the preview cannot show is the bug this rules out.
      const result = validateContentDocument(document(body, section), "draft");
      expect(
        result.ok,
        result.diagnostics.map((d) => d.message).join(" | "),
      ).toBe(true);
      await expect(
        assertContentRenders(body, section),
      ).resolves.toBeUndefined();
    },
  );
});

describe("assertContentRenders", () => {
  it("renders without touching the real components", async () => {
    // The whole reason it can run inside a publish request: the real manifest
    // reaches client components and data reads, and the stub does not.
    await expect(
      assertContentRenders(
        '<PaginaRelacionada href="/estadisticas/alquiler-caba">\n\nCopia.\n\n</PaginaRelacionada>\n',
        "estadisticas",
      ),
    ).resolves.toBeUndefined();
  });

  it("still renders the prose inside a container", async () => {
    // The stub is a passthrough, not a black hole: copy an author wrote inside
    // `<ClosingCta>` is part of the document being checked.
    await expect(
      assertContentRenders(
        '<ClosingCta title="Título">\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n</ClosingCta>\n',
        "guias",
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses forbidden content without rendering it", async () => {
    await expect(
      assertContentRenders("{(globalThis.__escaped = true)}\n", "guias"),
    ).rejects.toThrow(ContentGrammarError);
    expect((globalThis as Record<string, unknown>).__escaped).toBeUndefined();
  });

  it("refuses a component that is not registered for the section", async () => {
    // The gate that keeps a statistics figure out of a guide. It would render
    // fine — the component exists — so only validation stops it.
    await expect(
      assertContentRenders("<DelitosCabaMapa />\n", "guias"),
    ).rejects.toThrow(ContentGrammarError);
  });
});
