import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { Fuentes } from "./Fuentes";

// The block is shared by four sections that do not mean the same thing by it.
// A statistics page publishes a compiled table and says under what terms; a
// guide cites the distributor's own documentation and publishes nothing. The
// licence paragraph is the difference, and it follows the `license` prop rather
// than a default — so these two cases are the contract.

const items = [
  {
    label: "Naturgy BAN — Conocé tu factura",
    href: "https://www.naturgyban.com.ar/conoce-tu-factura-hogares-comercios/",
    note: "El instructivo oficial.",
  },
];

describe("Fuentes", () => {
  it("lists the sources with their links and notes", async () => {
    const html = await renderToHtml(createElement(Fuentes, { items }));
    expect(html).toContain("Naturgy BAN — Conocé tu factura");
    expect(html).toContain(
      "https://www.naturgyban.com.ar/conoce-tu-factura-hogares-comercios/",
    );
    expect(html).toContain("El instructivo oficial.");
  });

  it("prints the licence line when the page publishes data of its own", async () => {
    const html = await renderToHtml(
      createElement(Fuentes, {
        items,
        license: {
          url: "https://creativecommons.org/licenses/by/4.0/",
          name: "CC BY 4.0",
        },
      }),
    );
    expect(html).toContain("Las tablas y series derivadas");
    expect(html).toContain("CC BY 4.0");
  });

  it("omits the licence line when no licence is given", async () => {
    // The guide and news routes pass none: there is no table on those pages for
    // a licence to describe, and defaulting to the site-wide one would have the
    // article claim something about data it does not publish.
    const html = await renderToHtml(createElement(Fuentes, { items }));
    expect(html).not.toContain("Las tablas y series derivadas");
  });

  it("renders nothing when there are no sources", async () => {
    const html = await renderToHtml(createElement(Fuentes, { items: [] }));
    expect(html.trim()).toBe("");
  });
});
