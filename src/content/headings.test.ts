import { describe, expect, it } from "vitest";
import { extractHeadings } from "./headings";

describe("extractHeadings", () => {
  it("returns h2s in document order, ignoring other levels", () => {
    expect(
      extractHeadings(`
Intro paragraph.

## Primero

### Un detalle

## Segundo

#### Nota
`),
    ).toEqual([
      { id: "primero", text: "Primero" },
      { id: "segundo", text: "Segundo" },
    ]);
  });

  it("keeps accents, as rehype-slug does", () => {
    expect(extractHeadings("## Cómo leer tu factura")).toEqual([
      { id: "cómo-leer-tu-factura", text: "Cómo leer tu factura" },
    ]);
  });

  it("strips inline markdown from the text before slugging", () => {
    expect(
      extractHeadings(
        "## El cargo **fijo**, el [subsidio](/guias/subsidio) y `kWh`",
      ),
    ).toEqual([
      {
        id: "el-cargo-fijo-el-subsidio-y-kwh",
        text: "El cargo fijo, el subsidio y kWh",
      },
    ]);
  });

  it("counts headings of every level when deduping, like rehype-slug", () => {
    // The h3 takes the bare slug, so the *second* h2 of that name is `-2`, not
    // `-1`. Slugging only the h2s here would produce a link to nothing.
    expect(
      extractHeadings(`
## Tarifas

### Detalle

#### Detalle

## Detalle
`),
    ).toEqual([
      { id: "tarifas", text: "Tarifas" },
      { id: "detalle-2", text: "Detalle" },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    expect(
      extractHeadings(`
## Real

\`\`\`md
## No es un título
\`\`\`

~~~
## Tampoco
~~~

## También real
`),
    ).toEqual([
      { id: "real", text: "Real" },
      { id: "también-real", text: "También real" },
    ]);
  });

  it("drops a closing run of hashes", () => {
    expect(extractHeadings("## Con cierre ##")).toEqual([
      { id: "con-cierre", text: "Con cierre" },
    ]);
  });

  it("ignores a lone hash run and text that only looks like a heading", () => {
    expect(extractHeadings("##Sin espacio\n\n##\n\nno#un#título")).toEqual([]);
  });

  it("returns nothing for a body with no sections", () => {
    expect(extractHeadings("Solo prosa.\n\nY otro párrafo.")).toEqual([]);
  });
});
