import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { Metodologia } from "./Metodologia";

// The block's whole contract is that its five fields are optional *separately*.
// A page that can honestly answer two of them says the two, and the rows it
// draws are the rows it has — no empty labels, no "—", no gaps where a field
// would have been.

describe("Metodologia", () => {
  it("draws the fields the page filled in, labelled", async () => {
    const html = await renderToHtml(
      createElement(Metodologia, {
        value: {
          sources: "OVS, IDECBA y Datos Abiertos PBA.",
          limitations: "Relevamiento único; no es una serie temporal.",
        },
      }),
    );
    expect(html).toContain("Fuentes");
    expect(html).toContain("OVS, IDECBA y Datos Abiertos PBA.");
    expect(html).toContain("Limitaciones");
    expect(html).toContain("Relevamiento único; no es una serie temporal.");
  });

  it("says nothing about the fields the page left out", async () => {
    const html = await renderToHtml(
      createElement(Metodologia, { value: { period: "2021–2024." } }),
    );
    expect(html).toContain("Período");
    expect(html).not.toContain("Cobertura");
    expect(html).not.toContain("Métricas");
    expect(html).not.toContain("Limitaciones");
  });

  it("keeps the declared order whatever order the fields were written in", async () => {
    // The stored object is JSONB and its key order is whoever wrote it last.
    // The block reads as a sequence — whose numbers, from when, covering what —
    // so the order is the manifest's, not the object's.
    const html = await renderToHtml(
      createElement(Metodologia, {
        value: { limitations: "Caveat.", sources: "Organismo." },
      }),
    );
    expect(html.indexOf("Organismo.")).toBeLessThan(html.indexOf("Caveat."));
  });

  it("renders nothing when every field is empty", async () => {
    // Which is also why the contents column skips the entry and the validator
    // warns: a tag over an empty block is a section that is not there.
    for (const value of [undefined, {}, { coverage: "   " }]) {
      const html = await renderToHtml(createElement(Metodologia, { value }));
      expect(html.trim()).toBe("");
    }
  });
});
