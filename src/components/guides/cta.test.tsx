import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import { DEFAULT_TOP_CTA } from "@/content-system/cta";
import { TopCta } from "./cta";

// `cta` is an optional column that the CMS writes as "" when an editor leaves
// it alone, so "no copy" reaches this component as an empty string at least as
// often as it does as `undefined`. Every one of those spellings has to end up
// showing the default line — a blank strip above the article is the one outcome
// the field being optional must not produce.
describe("TopCta", () => {
  it("shows the page's own line when it has one", async () => {
    const html = await renderToHtml(
      createElement(TopCta, null, "¿Tu factura subió? Mira cuánto y por qué."),
    );
    expect(html).toContain("¿Tu factura subió? Mira cuánto y por qué.");
    expect(html).not.toContain(DEFAULT_TOP_CTA);
  });

  for (const [name, children] of [
    ["omitted", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["null", null],
  ] as const) {
    it(`falls back to the default line when the copy is ${name}`, async () => {
      const html = await renderToHtml(createElement(TopCta, null, children));
      expect(html).toContain(DEFAULT_TOP_CTA);
    });
  }

  it("keeps the button whatever the copy is", async () => {
    const html = await renderToHtml(createElement(TopCta, null, ""));
    expect(html).toContain("Crear una cuenta");
  });
});
