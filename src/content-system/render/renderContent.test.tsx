import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import {
  compileContent,
  compileContentForPreview,
  ContentGrammarError,
} from "./renderContent";

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

describe("the preview tolerates components that do not exist yet", () => {
  // An article and its components are written together and land in the
  // codebase one deploy apart. The preview renders the prose around the gap
  // rather than replacing the whole page with an error.
  const render = async (body: string) => {
    const { Content, missing } = await compileContentForPreview(body, "guias");
    return { html: await renderToHtml(createElement(Content)), missing };
  };

  it("names the unknown components instead of throwing", async () => {
    const { missing } = await compileContentForPreview(
      "Antes.\n\n<Inventado />\n\n<TambienInventado />\n\nDespués.\n",
      "guias",
    );
    expect(missing).toEqual(["Inventado", "TambienInventado"]);
  });

  it("still refuses a member expression, which nothing can stub", async () => {
    // `<Foo.Bar />` compiles to a property lookup on an object MDX demands, so
    // binding the name would not help.
    await expect(
      compileContentForPreview("<Inventado.Sub />\n", "guias"),
    ).rejects.toThrow(ContentGrammarError);
  });

  it("compiles the rest of the page", async () => {
    // Rendering `Inventado` needs the caller to bind the name — MDX throws
    // "Expected component … to be defined" otherwise — which is the preview
    // route's job. What compilation has to give it is a working component and
    // the list of names to bind.
    const { html, missing } = await render("Un **párrafo**.\n\n## Un título\n");
    expect(missing).toEqual([]);
    expect(html).toContain("<strong>");
    expect(html).toContain('id="un-título"');
  });

  it("renders nothing where the component was, given a stub", async () => {
    const { Content, missing } = await compileContentForPreview(
      'Antes.\n\n<Inventado dato="x" />\n\nDespués.\n',
      "guias",
    );
    const html = await renderToHtml(
      createElement(Content, {
        components: Object.fromEntries(
          missing.map((name) => [name, () => null]),
        ),
      }),
    );
    expect(html).toContain("Antes.");
    expect(html).toContain("Después.");
    expect(html).not.toContain("Inventado");
  });

  it("still refuses everything else the grammar refuses", async () => {
    await expect(
      compileContentForPreview(
        "<script>{(globalThis.__contentEscaped = true)}</script>\n",
        "guias",
      ),
    ).rejects.toThrow(ContentGrammarError);
    await expect(
      compileContentForPreview(
        "{(globalThis.__contentEscaped = true)}\n",
        "guias",
      ),
    ).rejects.toThrow(ContentGrammarError);
    expect(globalThis.__contentEscaped).toBeUndefined();
  });

  it("refuses an expression smuggled onto an unknown component", async () => {
    // The reason tolerance stops at the name: an unknown component is still
    // compiled, so its attributes are still evaluated. `{…}` there would run.
    await expect(
      compileContentForPreview(
        "<Inventado dato={(globalThis.__contentEscaped = true)} />\n",
        "guias",
      ),
    ).rejects.toThrow(ContentGrammarError);
    expect(globalThis.__contentEscaped).toBeUndefined();
  });

  it("refuses forbidden content nested inside an unknown component", async () => {
    await expect(
      compileContentForPreview(
        "<Inventado>\n\n<script>{(globalThis.__contentEscaped = true)}</script>\n\n</Inventado>\n",
        "guias",
      ),
    ).rejects.toThrow(ContentGrammarError);
    expect(globalThis.__contentEscaped).toBeUndefined();
  });

  it("leaves the strict compiler strict", async () => {
    await expect(compileContent("<Inventado />\n", "guias")).rejects.toThrow(
      ContentGrammarError,
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
