import { describe, expect, it } from "vitest";
import { extractBodyReferences, mediaIdsIn } from "./references";
import {
  buildMediaPermalink,
  isMediaPermalink,
  parseMediaPermalink,
  slugifyFilename,
} from "./permalink";

const ID = "8f2c1b7a-4d3e-4a1f-9c2b-0e5d6a7f8b90";
const OTHER = "11111111-2222-4333-8444-555555555555";
const link = (name = "medidor.jpg") => `/media/${ID}/${name}`;

describe("parseMediaPermalink", () => {
  it("resolves by uuid and ignores the descriptive filename", () => {
    expect(parseMediaPermalink(link())?.id).toBe(ID);
    expect(parseMediaPermalink(link("otro-nombre.png"))?.id).toBe(ID);
  });

  it("lowercases the id so it compares equal to what PostgreSQL stores", () => {
    expect(parseMediaPermalink(`/media/${ID.toUpperCase()}/a.jpg`)?.id).toBe(
      ID,
    );
  });

  it("requires an extension, because the locale proxy rewrites paths without one", () => {
    expect(isMediaPermalink(`/media/${ID}/medidor`)).toBe(false);
    expect(isMediaPermalink(`/media/${ID}/medidor.jpg`)).toBe(true);
  });

  it("rejects anything that is not this exact shape", () => {
    for (const url of [
      "/img/guias/factura.jpg",
      "https://media.factura.uno/cms-media/x/y.jpg",
      `/media/not-a-uuid/a.jpg`,
      `/media/${ID}`,
      `/media/${ID}/nested/a.jpg`,
    ]) {
      expect(isMediaPermalink(url), url).toBe(false);
    }
  });
});

describe("buildMediaPermalink", () => {
  it("takes the extension from the stored file and the stem from the title", () => {
    expect(
      buildMediaPermalink({
        id: ID,
        displayName: "Medidor de luz",
        originalFilename: "IMG_0042.JPEG",
      }),
    ).toBe(`/media/${ID}/medidor-de-luz.jpeg`);
  });

  it("survives a title that slugifies to nothing", () => {
    expect(
      buildMediaPermalink({
        id: ID,
        displayName: "¿?",
        originalFilename: "a.png",
      }),
    ).toBe(`/media/${ID}/imagen.png`);
  });

  it("strips accents rather than percent-encoding them", () => {
    expect(slugifyFilename("Boletín de AGIP")).toBe("boletin-de-agip");
  });
});

describe("extractBodyReferences", () => {
  it("finds Markdown images and keeps their alt text", () => {
    const { media } = extractBodyReferences(`![Un medidor](${link()})`);
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      mediaId: ID,
      kind: "image",
      alt: "Un medidor",
    });
    expect(media[0].line).toBe(1);
  });

  it("does not count a permalink inside a fenced code block", () => {
    const body = ["```md", `![no](${link()})`, "```"].join("\n");
    expect(mediaIdsIn(body)).toEqual([]);
  });

  it("resolves reference-style images against their definition", () => {
    const body = [`![Un medidor][medidor]`, ``, `[medidor]: ${link()}`].join(
      "\n",
    );
    expect(mediaIdsIn(body)).toEqual([ID]);
  });

  it("counts a link to an image, not only an embedded one", () => {
    const { media } = extractBodyReferences(`[ver la factura](${link()})`);
    expect(media).toMatchObject([{ mediaId: ID, kind: "link", alt: null }]);
  });

  it("counts a permalink passed as a component attribute", () => {
    const { media } = extractBodyReferences(
      `<PaginaRelacionada href="${link()}" />`,
    );
    expect(media).toMatchObject([{ mediaId: ID, kind: "attribute" }]);
  });

  it("reports an empty alt as empty rather than missing", () => {
    const { media } = extractBodyReferences(`![](${link()})`);
    expect(media[0].alt).toBe("");
  });

  it("deduplicates ids while keeping every reference", () => {
    const body = `![a](${link()})\n\n![b](${link("otro.jpg")})\n\n![c](/media/${OTHER}/z.jpg)`;
    expect(extractBodyReferences(body).media).toHaveLength(3);
    expect(mediaIdsIn(body)).toEqual([ID, OTHER]);
  });

  it("ignores a path that is not a library permalink", () => {
    const { media, external } = extractBodyReferences(
      `![Factura](/img/guias/factura-edesur-ejemplo.jpg)`,
    );
    expect(media).toEqual([]);
    expect(external).toEqual([]);
  });

  it("returns nothing for a body that cannot be parsed, rather than throwing", () => {
    expect(() => extractBodyReferences("<Unclosed")).not.toThrow();
  });
});
