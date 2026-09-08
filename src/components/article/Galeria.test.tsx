import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { renderToHtml } from "../../../test/renderToHtml";
import type { MediaRef } from "@/content-system/media/repository";
import { Galeria } from "./Galeria";

// What this file is actually about: the join between the markdown an author
// writes and the pictures the viewer gets.
//
// The images arrive as *React elements* — MDX has already compiled
// `![alt](…)` into whatever the component map binds to `img`, wrapped in the
// paragraph markdown put around them — so the gallery has to read its own
// children back out. Everything below is a way that read can go wrong on a
// published page: the wrong order, a lost caption, an id the library no longer
// has, or a route that never resolved the library at all.

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const permalink = (n: number) => `/media/${id(n)}/pantalla-${n}.png`;

const ref = (n: number): MediaRef => ({
  id: id(n),
  src: `https://media.example/pantalla-${n}.png`,
  width: 1200,
  height: 900,
  defaultAlt: `Alt de biblioteca ${n}`,
  decorative: false,
  mimeType: "image/png",
});

const library = (...refs: MediaRef[]) =>
  new Map(refs.map((media) => [media.id, media]));

/** The children MDX hands the component: one paragraph holding the images, the
 * way consecutive `![…](…)` lines compile. */
const paragraph = (
  ...images: { src: string; alt?: string; title?: string }[]
) =>
  h(
    "p",
    null,
    images.map((image, index) => h("img", { key: index, ...image })),
  );

describe("Galeria", () => {
  it("renders a tile per image, in the order they were written", async () => {
    const html = await renderToHtml(
      h(Galeria, {
        media: library(ref(1), ref(2), ref(3)),
        children: paragraph(
          { src: permalink(1), alt: "La primera" },
          { src: permalink(2), alt: "La segunda" },
          { src: permalink(3), alt: "La tercera" },
        ),
      }),
    );

    const order = ["La primera", "La segunda", "La tercera"].map((alt) =>
      html.indexOf(alt),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("finds images however markdown wrapped them", async () => {
    // Blank lines between the images make a paragraph each instead of one
    // paragraph with three children. Same gallery either way.
    const html = await renderToHtml(
      h(Galeria, {
        media: library(ref(1), ref(2)),
        children: [
          paragraph({ src: permalink(1), alt: "La primera" }),
          paragraph({ src: permalink(2), alt: "La segunda" }),
        ],
      }),
    );
    expect(html).toContain("La primera");
    expect(html).toContain("La segunda");
  });

  it("prints the markdown title as the caption, and keeps the alt as the alt", async () => {
    const html = await renderToHtml(
      h(Galeria, {
        media: library(ref(1), ref(2)),
        children: paragraph(
          {
            src: permalink(1),
            alt: "El buscador de suministro",
            title: "Ingresá el DNI, el CUIT o el NIS.",
          },
          { src: permalink(2), alt: "El resumen del período" },
        ),
      }),
    );
    expect(html).toContain("Ingresá el DNI, el CUIT o el NIS.");
    expect(html).toContain('alt="El buscador de suministro"');
  });

  it("falls back to the library's default alt when the author wrote none", async () => {
    const html = await renderToHtml(
      h(Galeria, {
        media: library(ref(1), ref(2)),
        children: paragraph({ src: permalink(1) }, { src: permalink(2) }),
      }),
    );
    expect(html).toContain('alt="Alt de biblioteca 1"');
  });

  it("labels the gallery when the author gave it a title", async () => {
    const html = await renderToHtml(
      h(Galeria, {
        title: "Pantallas · Pago Rápido",
        media: library(ref(1), ref(2)),
        children: paragraph({ src: permalink(1) }, { src: permalink(2) }),
      }),
    );
    expect(html).toContain("Pantallas · Pago Rápido");
    expect(html).toContain("02 imágenes");
  });

  it("drops an image the library no longer has rather than leaving a hole", async () => {
    // Validation refuses an unknown id on save, so this is a purged asset or a
    // hand-edited body. The remaining tiles still make sense; a broken frame in
    // the middle of a grid reads as a layout bug.
    const html = await renderToHtml(
      h(Galeria, {
        media: library(ref(1), ref(3)),
        children: paragraph(
          { src: permalink(1), alt: "La primera" },
          { src: permalink(2), alt: "La perdida" },
          { src: permalink(3), alt: "La tercera" },
        ),
      }),
    );
    expect(html).toContain("La primera");
    expect(html).toContain("La tercera");
    expect(html).not.toContain("La perdida");
  });

  it("renders nothing when none of its images resolve", async () => {
    const html = await renderToHtml(
      h(Galeria, {
        media: library(),
        children: paragraph({ src: permalink(1) }, { src: permalink(2) }),
      }),
    );
    expect(html.trim()).toBe("");
  });

  it("shows the pictures as written when nobody resolved the library", async () => {
    // The manifest binds the component without a map — every route that
    // renders a body installs `mediaComponents()`, which is the real binding.
    // If one ever forgets, the article loses the gallery, not the images.
    const html = await renderToHtml(
      h(Galeria, {
        children: paragraph(
          { src: permalink(1), alt: "La primera" },
          { src: permalink(2), alt: "La segunda" },
        ),
      }),
    );
    expect(html).toContain(permalink(1));
    expect(html).toContain("La segunda");
  });
});
