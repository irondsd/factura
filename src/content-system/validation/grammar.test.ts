import { describe, expect, it } from "vitest";
import {
  CONTENT_COMPONENT_NAMES,
  componentDefinition,
} from "../components/manifest";
import { GRAMMAR_CODES, validateGrammar } from "./grammar";

// The Phase 3 gate: "Database content cannot execute arbitrary JavaScript."
// Every forbidden category below has its own case, because a denylist that is
// only tested in aggregate is a denylist with a hole in it.

const check = (body: string) => validateGrammar(body, "guias");
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
    expect(check("![Factura de ejemplo](/img/guias/ejemplo.jpg)\n").ok).toBe(
      true,
    );
  });
});

describe("allowed components", () => {
  // One case per registered component, written the way a guide writes it.
  const samples: Record<string, string> = {
    ClosingCta:
      '<ClosingCta title="Tu factura, no el promedio">\n\nDos frases.\n\n</ClosingCta>',
    ProbarCta:
      '<ProbarCta vendor="Edesur" noun="factura">\n\nTexto.\n\n</ProbarCta>',
    CtaButton:
      '<CtaButton href="/demo" variant="invert">Ver la demo</CtaButton>',
    CtaRow: "<CtaRow>\n\n<DemoCta />\n\n</CtaRow>",
    DemoCta: "<DemoCta />",
    SignupCta: "<SignupCta />",
    InflacionChart: '<InflacionChart chart="luz-y-gas" />',
    TrustBlock: "<TrustBlock />",
    Faq: "<Faq />",
    RelatedGuides: "<RelatedGuides />",
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
      const result = check(`${source}\n`);
      expect(result.diagnostics).toEqual([]);
    });
  }

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
    // Nothing in this layer is advisory: cms.md §3.5 says forbidden syntax is
    // rejected, never stripped or warned about.
    for (const diagnostic of check("import x from 'y';\n\n<div />\n")
      .diagnostics) {
      expect(diagnostic.severity).toBe("error");
    }
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
