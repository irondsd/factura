import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { compileContent, ContentGrammarError } from "./renderContent";

// The Phase 3 gate, verified at the point it actually matters: compilation.
//
// `evaluate` turns MDX into a function and runs it. Everything else in this
// phase is a check that can be bypassed by calling the compiler directly, so
// the check has to live inside the only compiler the app has — and these tests
// prove it does.

declare global {
  var __contentEscaped: boolean | undefined;
}

afterEach(() => {
  delete globalThis.__contentEscaped;
});

describe("compilation is gated on grammar validation", () => {
  it("refuses forbidden content and never evaluates it", async () => {
    // The proof, rather than an assertion about ordering: this body sets a
    // global if it is ever evaluated. If the gate were removed — or moved to
    // after `evaluate` — the flag below would be true and the test would fail
    // even though the error was still thrown.
    const malicious = "{(globalThis.__contentEscaped = true)}\n";

    await expect(compileContent(malicious, "guias")).rejects.toThrow(
      ContentGrammarError,
    );
    expect(globalThis.__contentEscaped).toBeUndefined();
  });

  it("never evaluates an import", async () => {
    await expect(
      compileContent('import fs from "node:fs";\n', "guias"),
    ).rejects.toThrow(ContentGrammarError);
  });

  it("never evaluates a script tag", async () => {
    await expect(
      compileContent(
        "<script>{(globalThis.__contentEscaped = true)}</script>\n",
        "guias",
      ),
    ).rejects.toThrow(ContentGrammarError);
    expect(globalThis.__contentEscaped).toBeUndefined();
  });

  it("never evaluates an expression hidden inside an allowed container", async () => {
    await expect(
      compileContent(
        '<ClosingCta title="x">\n\n{(globalThis.__contentEscaped = true)}\n\n</ClosingCta>\n',
        "guias",
      ),
    ).rejects.toThrow(ContentGrammarError);
    expect(globalThis.__contentEscaped).toBeUndefined();
  });

  it("carries the diagnostics on the error", async () => {
    const error = await compileContent("<Inventado />\n", "guias").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ContentGrammarError);
    expect((error as ContentGrammarError).diagnostics.length).toBeGreaterThan(
      0,
    );
    expect((error as ContentGrammarError).diagnostics[0].message).toContain(
      "Inventado",
    );
  });
});

describe("rendering valid content", () => {
  const render = async (body: string) => {
    const Content = await compileContent(body, "guias");
    return renderToHtml(createElement(Content));
  };

  it("renders prose", async () => {
    const html = await render("Un **párrafo**.\n");
    expect(html).toContain("<strong>");
    expect(html).toContain("párrafo");
  });

  it("preserves GFM tables", async () => {
    // Same plugin list as next.config.ts. Without remark-gfm this is a
    // paragraph full of pipe characters.
    const html = await render(`| Sección | Qué revisar |
| ------- | ----------- |
| Total   | El importe  |
`);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain("El importe");
  });

  it("gives headings the ids the table of contents links to", async () => {
    // rehype-slug. The article's contents column links to these; without the
    // plugin every anchor in every migrated guide would point at nothing.
    const html = await render("## Las secciones de la factura\n");
    expect(html).toContain('id="las-secciones-de-la-factura"');
  });

  it("keeps accents out of the generated id the same way the site does", async () => {
    const html = await render("## Cómo leer la boleta\n");
    expect(html).toContain('id="cómo-leer-la-boleta"');
  });
});
