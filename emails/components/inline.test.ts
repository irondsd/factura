import { describe, expect, it } from "vitest";
import { tokenizeInline } from "./inline";

describe("tokenizeInline", () => {
  it("leaves plain copy as a single run", () => {
    expect(tokenizeInline("Subí tu primera factura.")).toEqual([
      { type: "text", value: "Subí tu primera factura." },
    ]);
  });

  it("reads bold and links surrounded by text", () => {
    expect(
      tokenizeInline("Hola **Marisol**, abrí tu [registro](https://x.test)."),
    ).toEqual([
      { type: "text", value: "Hola " },
      { type: "bold", value: "Marisol" },
      { type: "text", value: ", abrí tu " },
      { type: "link", value: "registro", href: "https://x.test" },
      { type: "text", value: "." },
    ]);
  });

  it("accepts mailto links", () => {
    expect(tokenizeInline("[Escribinos](mailto:hola@x.test)")).toEqual([
      { type: "link", value: "Escribinos", href: "mailto:hola@x.test" },
    ]);
  });

  it("keeps the label but drops the anchor for an unsafe scheme", () => {
    // The grammar has to fail closed: campaign copy is content, and a /cms
    // textarea would let an author type this straight into a real inbox.
    expect(tokenizeInline("[Ver](/app/relativo)")).toEqual([
      { type: "text", value: "Ver" },
    ]);
    // The href run stops at the first ")", so a nested paren leaves the tail
    // behind as literal text. Harmless, and better than a greedy href that
    // could swallow the rest of the line.
    expect(tokenizeInline("[Tocá acá](javascript:alert(1))")).toEqual([
      { type: "text", value: "Tocá acá" },
      { type: "text", value: ")" },
    ]);
  });

  it("leaves an unclosed marker literal rather than swallowing the rest", () => {
    expect(tokenizeInline("Un **total sin cerrar y más texto")).toEqual([
      { type: "text", value: "Un **total sin cerrar y más texto" },
    ]);
    expect(tokenizeInline("Un [link sin URL y más texto")).toEqual([
      { type: "text", value: "Un [link sin URL y más texto" },
    ]);
  });

  it("does not nest: a marker inside a link label stays literal", () => {
    expect(tokenizeInline("[**registro**](https://x.test)")).toEqual([
      { type: "link", value: "**registro**", href: "https://x.test" },
    ]);
  });

  it("handles adjacent markers without emitting empty runs", () => {
    expect(tokenizeInline("**uno****dos**")).toEqual([
      { type: "bold", value: "uno" },
      { type: "bold", value: "dos" },
    ]);
  });

  it("returns nothing for empty copy", () => {
    expect(tokenizeInline("")).toEqual([]);
  });
});
