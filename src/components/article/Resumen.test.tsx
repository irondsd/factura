import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { Resumen } from "./Resumen";

// Three properties, and each one is a way the block has to break to be wrong
// on a published page rather than merely ugly:
//
//   1. it prints the author's prose — the whole point, and the thing a bad
//      wrapper (or a `null` guard that is too eager) silently removes;
//   2. it does not wrap that prose in a `<p>`, because MDX already did, and a
//      nested `<p>` is a hydration error on every article that uses it;
//   3. an empty tag renders nothing, so a saved-but-unwritten summary is a
//      missing block and not an empty tinted rectangle.

describe("Resumen", () => {
  it("renders the summary prose the author wrote", async () => {
    const html = await renderToHtml(
      createElement(
        Resumen,
        null,
        createElement(
          "p",
          null,
          "La mediana del m² en la Provincia es la mitad que en la Ciudad.",
        ),
      ),
    );
    expect(html).toContain(
      "La mediana del m² en la Provincia es la mitad que en la Ciudad.",
    );
  });

  it("names itself as a landmark so a reader can skip it", async () => {
    const html = await renderToHtml(
      createElement(Resumen, null, createElement("p", null, "Dos frases.")),
    );
    expect(html).toContain("<aside");
    expect(html).toContain('aria-label="Resumen"');
  });

  it("does not add a paragraph of its own around MDX's", async () => {
    // MDX compiles the child prose to <p>. A <p> from this component around it
    // is invalid HTML, and React reports it as a hydration failure on the
    // client — on every page that places the block.
    const html = await renderToHtml(
      createElement(Resumen, null, createElement("p", null, "Dos frases.")),
    );
    expect(html.match(/<p[\s>]/g) ?? []).toHaveLength(1);
  });

  it("renders nothing when the tag was left empty", async () => {
    expect((await renderToHtml(createElement(Resumen))).trim()).toBe("");
    expect((await renderToHtml(createElement(Resumen, null, ""))).trim()).toBe(
      "",
    );
    expect(
      (await renderToHtml(createElement(Resumen, null, "   "))).trim(),
    ).toBe("");
  });
});
