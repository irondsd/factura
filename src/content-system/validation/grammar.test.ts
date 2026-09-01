import { describe, expect, it } from "vitest";
import {
  CONTENT_COMPONENT_NAMES,
  componentDefinition,
} from "../components/manifest";
import { SECTION_COMPONENT_NAMES } from "../components/sectionDefinitions";
import { GRAMMAR_CODES, validateGrammar } from "./grammar";

// The Phase 3 gate: "Database content cannot execute arbitrary JavaScript."
// Every forbidden category below has its own case, because a denylist that is
// only tested in aggregate is a denylist with a hole in it.

const check = (
  body: string,
  section: "guias" | "noticias" | "estadisticas" | "investigaciones" = "guias",
) => validateGrammar(body, section);
const codes = (body: string) => check(body).diagnostics.map((d) => d.code);

describe("plain markdown", () => {
  it("accepts prose, headings, lists, links and code", () => {
    const result = check(`# Título

Un párrafo con **negrita**, *cursiva* y un [enlace](/guias/otra).

## Sección

- uno
- dos

\`\`\`text
un bloque
\`\`\`

> Una cita.
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts GFM tables, which every bill guide uses", () => {
    // remark-gfm is in the parse pipeline for exactly this reason: without it
    // the table below is prose and the pipe characters are literal text.
    const result = check(`| Sección | Qué revisar |
| ------- | ----------- |
| Total   | El importe  |
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("accepts an image, which guides use for bill screenshots", () => {
    expect(
      check(
        "![Factura de ejemplo](/media/8f2c1b7a-4d3e-4a1f-9c2b-0e5d6a7f8b90/ejemplo.jpg)\n",
      ).ok,
    ).toBe(true);
  });
});

describe("allowed components", () => {
  // One case per registered component, written the way a guide writes it.
  const samples: Record<string, string> = {
    ClosingCta:
      '<ClosingCta title="Tu factura, no el promedio">\n\nDos frases.\n\n</ClosingCta>',
    ProbarCta:
      '<ProbarCta vendor="Edesur" noun="factura">\n\nTexto.\n\n</ProbarCta>',
    Resumen: "<Resumen>\n\nLa respuesta en dos frases.\n\n</Resumen>",
    CtaButton:
      '<CtaButton href="/demo" variant="invert">Ver la demo</CtaButton>',
    CtaRow: "<CtaRow>\n\n<DemoCta />\n\n</CtaRow>",
    DemoCta: "<DemoCta />",
    SignupCta: "<SignupCta />",
    InflacionChart: '<InflacionChart chart="luz-y-gas" />',
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

  it("has a sample for every registered component", () => {
    // Keeps this suite honest when the manifest grows: a new component with no
    // sample fails here rather than going untested.
    expect(Object.keys(samples).sort()).toEqual(
      [...CONTENT_COMPONENT_NAMES].sort(),
    );
  });

  for (const [name, source] of Object.entries(samples)) {
    it(`accepts <${name}> as guides write it`, () => {
      const result = check(
        `${source}\n`,
        (
          [...SECTION_COMPONENT_NAMES, "Fuentes", "Subpaginas"] as string[]
        ).includes(name)
          ? "estadisticas"
          : "guias",
      );
      expect(result.diagnostics).toEqual([]);
    });
  }

  it("accepts a related statistics card in a guide", () => {
    const result = check(
      '<PaginaRelacionada href="/estadisticas/escrituras-provincia-buenos-aires">\n\nLa serie completa.\n\n</PaginaRelacionada>\n',
      "guias",
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("accepts a container with markdown children", () => {
    expect(
      check(
        '<ClosingCta title="Hola">\n\nUn **párrafo** y un [enlace](/guias/x).\n\n</ClosingCta>\n',
      ).diagnostics,
    ).toEqual([]);
  });

  it("accepts optional properties being omitted", () => {
    expect(
      check("<ProbarCta>\n\nTexto.\n\n</ProbarCta>\n").diagnostics,
    ).toEqual([]);
  });
});

describe("forbidden: ESM", () => {
  it("rejects an import", () => {
    // The exact line all ten InflacionChart guides carry today. The manifest is
    // what replaces it.
    expect(
      codes(
        'import { InflacionChart } from "@/components/guides/InflacionChart";\n',
      ),
    ).toContain(GRAMMAR_CODES.esm);
  });

  it("rejects an export", () => {
    expect(codes("export const meta = { title: 'x' };\n")).toContain(
      GRAMMAR_CODES.esm,
    );
  });

  it("explains what to do instead", () => {
    const [diagnostic] = check('import x from "y";\n').diagnostics;
    expect(diagnostic.message).toMatch(/no import needed/i);
  });
});

describe("forbidden: expressions", () => {
  it("rejects a block-level expression", () => {
    expect(codes("{process.env.SECRET}\n")).toContain(GRAMMAR_CODES.expression);
  });

  it("rejects an inline expression inside a paragraph", () => {
    expect(codes("Hola {globalThis.fetch('/x')} mundo\n")).toContain(
      GRAMMAR_CODES.expression,
    );
  });

  it("rejects an immediately-invoked function", () => {
    expect(codes("{(() => { while (true) {} })()}\n")).toContain(
      GRAMMAR_CODES.expression,
    );
  });
});

describe("forbidden: attributes", () => {
  it("rejects a spread", () => {
    expect(codes("<ProbarCta {...props}>x</ProbarCta>\n")).toContain(
      GRAMMAR_CODES.spreadAttribute,
    );
  });

  it("rejects an event handler", () => {
    // The attribute is a JS expression, which is the rule that catches every
    // handler at once rather than a list of `on*` names to keep up to date.
    expect(
      codes("<ProbarCta onClick={() => alert(1)}>x</ProbarCta>\n"),
    ).toContain(GRAMMAR_CODES.expressionAttribute);
  });

  it("rejects an expression-valued property", () => {
    expect(codes('<InflacionChart chart={"luz-y-gas"} />\n')).toContain(
      GRAMMAR_CODES.expressionAttribute,
    );
  });

  it("rejects a function-valued property", () => {
    expect(codes("<ProbarCta noun={function () {}}>x</ProbarCta>\n")).toContain(
      GRAMMAR_CODES.expressionAttribute,
    );
  });
});

describe("forbidden: raw HTML and scripts", () => {
  it("rejects a script tag", () => {
    expect(codes("<script>alert(1)</script>\n")).toContain(
      GRAMMAR_CODES.rawHtml,
    );
  });

  it("rejects an iframe", () => {
    expect(codes('<iframe src="https://evil.example" />\n')).toContain(
      GRAMMAR_CODES.rawHtml,
    );
  });

  it("rejects a plain div, so the allowlist has no HTML escape hatch", () => {
    expect(codes("<div>hola</div>\n")).toContain(GRAMMAR_CODES.rawHtml);
  });

  it("rejects an img with an onerror handler", () => {
    // The classic. Caught as raw HTML before the attribute rule even runs.
    expect(codes('<img src="x" onerror="alert(1)" />\n')).toContain(
      GRAMMAR_CODES.rawHtml,
    );
  });

  it("rejects a fragment", () => {
    expect(codes("<>hola</>\n")).toContain(GRAMMAR_CODES.rawHtml);
  });
});

describe("forbidden: unknown components", () => {
  it("rejects a component that is not registered", () => {
    expect(codes("<Inventado />\n")).toContain(GRAMMAR_CODES.unknownComponent);
  });

  it("lists what the author may use instead", () => {
    const [diagnostic] = check("<Inventado />\n").diagnostics;
    expect(diagnostic.message).toContain("InflacionChart");
  });

  it("rejects a component registered for another section", () => {
    // Nothing is registered for estadisticas yet (section 12 does that), so a
    // guide component asked for there is out of section.
    const result = validateGrammar("<TrustBlock />\n", "estadisticas");
    expect(result.diagnostics.map((d) => d.code)).toContain(
      GRAMMAR_CODES.wrongSection,
    );
  });

  it("names the component, so a caller can act on it without reading prose", () => {
    // What the CMS preview stubs out. The message may be reworded; this may
    // not.
    const [diagnostic] = check("<Inventado />\n").diagnostics;
    expect(diagnostic.component).toBe("Inventado");
  });

  it("checks the attributes of an unknown component too", () => {
    // Because the preview compiles it: an expression left unreported here
    // would be evaluated there.
    const found = codes('<Inventado dato={fetch("/x")} />\n');
    expect(found).toContain(GRAMMAR_CODES.unknownComponent);
    expect(found).toContain(GRAMMAR_CODES.expressionAttribute);
  });

  it("reports a nested finding once, not once per level", () => {
    const found = codes("<CtaRow>\n\n<script>alert(1)</script>\n\n</CtaRow>\n");
    expect(found.filter((c) => c === GRAMMAR_CODES.rawHtml)).toHaveLength(1);
  });
});

describe("invalid properties", () => {
  it("rejects an unknown property", () => {
    expect(
      codes('<InflacionChart chart="luz-y-gas" color="rojo" />\n'),
    ).toContain(GRAMMAR_CODES.invalidProps);
  });

  it("rejects a value outside the allowed set", () => {
    expect(codes('<InflacionChart chart="inventado" />\n')).toContain(
      GRAMMAR_CODES.invalidProps,
    );
  });

  it("rejects a missing required property", () => {
    expect(codes("<InflacionChart />\n")).toContain(GRAMMAR_CODES.invalidProps);
  });

  it("rejects a property on a context-bound component", () => {
    // <Faq /> renders the page's `faq` metadata; an attribute here would look
    // like it did something.
    expect(codes('<Faq items="x" />\n')).toContain(GRAMMAR_CODES.invalidProps);
  });

  it("rejects a javascript: href", () => {
    expect(
      codes('<CtaButton href="javascript:alert(1)">x</CtaButton>\n'),
    ).toContain(GRAMMAR_CODES.invalidProps);
  });

  it("rejects a data: href", () => {
    expect(
      codes(
        '<CtaButton href="data:text/html,<script>1</script>">x</CtaButton>\n',
      ),
    ).toContain(GRAMMAR_CODES.invalidProps);
  });

  it("accepts the boolean shorthand and the string spelling", () => {
    expect(
      check('<CtaButton href="/demo" newTab>Ver</CtaButton>\n').diagnostics,
    ).toEqual([]);
    expect(
      check('<CtaButton href="/demo" newTab="true">Ver</CtaButton>\n')
        .diagnostics,
    ).toEqual([]);
  });

  it("rejects a boolean written as something else", () => {
    expect(
      codes('<CtaButton href="/demo" newTab="quizás">Ver</CtaButton>\n'),
    ).toContain(GRAMMAR_CODES.invalidProps);
  });
});

describe("malformed and nested markup", () => {
  it("rejects an unclosed component", () => {
    const result = check("<ClosingCta>\n\nsin cerrar\n");
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe(GRAMMAR_CODES.parseError);
  });

  it("rejects mismatched tags", () => {
    const result = check("<ClosingCta>texto</ProbarCta>\n");
    expect(result.ok).toBe(false);
  });

  it("rejects content between the tags of a leaf component", () => {
    expect(codes("<TrustBlock>texto</TrustBlock>\n")).toContain(
      GRAMMAR_CODES.unexpectedChildren,
    );
  });

  it("allows whitespace between the tags of a leaf component", () => {
    // `<Faq>\n</Faq>` is odd but harmless, and treating whitespace as content
    // would reject shapes a formatter can produce.
    expect(check("<Faq>\n</Faq>\n").diagnostics).toEqual([]);
  });

  it("finds a violation nested inside an allowed container", () => {
    // The walk has to descend. A forbidden expression hidden two levels down is
    // the case a shallow check misses.
    expect(
      codes(
        '<ClosingCta title="x">\n\n<CtaRow>\n\n{alert(1)}\n\n</CtaRow>\n\n</ClosingCta>\n',
      ),
    ).toContain(GRAMMAR_CODES.expression);
  });

  it("finds a script nested inside an allowed container", () => {
    expect(
      codes(
        '<ClosingCta title="x">\n\n<script>alert(1)</script>\n\n</ClosingCta>\n',
      ),
    ).toContain(GRAMMAR_CODES.rawHtml);
  });
});

describe("diagnostics", () => {
  it("reports a line and a column", () => {
    const result = check("Un párrafo.\n\n<Inventado />\n");
    const [diagnostic] = result.diagnostics;
    expect(diagnostic.line).toBe(3);
    expect(diagnostic.column).toBe(1);
  });

  it("uses stable codes", () => {
    // The editor maps these to lint markers and the MCP returns them
    // structurally; they are API, unlike the messages.
    expect(Object.values(GRAMMAR_CODES)).toContain(
      check("<Inventado />\n").diagnostics[0].code,
    );
  });

  it("reports every violation, not just the first", () => {
    const result = check("{uno}\n\n{dos}\n\n<Inventado />\n");
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);
  });

  it("marks everything it finds as an error", () => {
    // Nothing in this layer is advisory: cms.md says forbidden syntax is
    // rejected, never stripped or warned about.
    for (const diagnostic of check("import x from 'y';\n\n<div />\n")
      .diagnostics) {
      expect(diagnostic.severity).toBe("error");
    }
  });
});

describe("link destinations", () => {
  // The hole markdown left open. Every rule above is about JSX, and
  // `[texto](javascript:…)` is not JSX — it is a `link` node, it survives every
  // component check, and it is the last way to write executable content in
  // prose. React neutralises `javascript:` hrefs at render today; `data:` it
  // does not, and "the renderer happens to catch it" is not where this
  // project puts a security rule.

  it("accepts the links guides actually write", () => {
    const result =
      check(`Ver [la guía](/guias/edesur), el [ente](https://www.enargas.gob.ar/),
[escribir](mailto:hola@factura.uno), [llamar](tel:+5491100000000) y [arriba](#inicio).
`);
    expect(result.diagnostics).toEqual([]);
  });

  it("refuses a javascript: link", () => {
    expect(codes("[hacé clic](javascript:alert(1))\n")).toContain(
      GRAMMAR_CODES.unsafeUrl,
    );
  });

  it("refuses a data: link", () => {
    expect(codes("[descargar](data:text/html,<script>x</script>)\n")).toContain(
      GRAMMAR_CODES.unsafeUrl,
    );
  });

  it("refuses a javascript: image source", () => {
    expect(codes("![alt](javascript:alert(1))\n")).toContain(
      GRAMMAR_CODES.unsafeUrl,
    );
  });

  it("refuses it in the reference form, where the URL is not next to the link", () => {
    // `[texto][ref]` looks harmless on its own line; the destination is
    // somewhere else in the document. Checking only inline links would miss it.
    expect(codes("Ver [esto][ref].\n\n[ref]: javascript:alert(1)\n")).toContain(
      GRAMMAR_CODES.unsafeUrl,
    );
  });

  it("refuses an autolink too, though the parser gets there first", () => {
    // `<javascript:alert(1)>` is JSX to MDX, not a markdown autolink, so it
    // never reaches a `link` node — it fails to parse. Asserted as "refused"
    // rather than as a specific code: what matters is that no spelling of this
    // is storable, and pinning the code here would make the test a claim about
    // MDX's parser instead.
    expect(check("<javascript:alert(1)>\n").ok).toBe(false);
  });

  it("refuses it on a component attribute", () => {
    // `CtaButton` constrains its own href, so this is belt and braces — but it
    // is the rule a component added next year inherits for free.
    expect(
      codes('<CtaButton href="javascript:alert(1)">Ver</CtaButton>\n'),
    ).toContain(GRAMMAR_CODES.unsafeUrl);
  });

  it("names the scheme, so the author knows what to change", () => {
    const [diagnostic] = check("[x](javascript:alert(1))\n").diagnostics;
    expect(diagnostic.message).toContain("javascript:");
    expect(diagnostic.severity).toBe("error");
  });

  it("reports where the link is", () => {
    const { diagnostics } = check("Un párrafo.\n\n[x](javascript:alert(1))\n");
    expect(diagnostics[0].line).toBe(3);
  });

  it("refuses a link the author disguised with whitespace", () => {
    expect(codes("[x](<java\tscript:alert(1)>)\n")).toContain(
      GRAMMAR_CODES.unsafeUrl,
    );
  });
});

describe("manifest coverage", () => {
  it("gives every component a schema and a description", () => {
    for (const name of CONTENT_COMPONENT_NAMES) {
      const definition = componentDefinition(name);
      expect(definition).toBeDefined();
      expect(definition?.description.length).toBeGreaterThan(20);
      expect(definition?.sections.length).toBeGreaterThan(0);
    }
  });
});
