import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS } from "@/content-system/types";
import {
  CMS_SECTIONS,
  cmsEditPath,
  cmsPreviewPath,
  cmsSectionPath,
  findCmsSection,
  findCmsSectionBySegment,
  findEditableSection,
} from "./sections";

describe("the section registry", () => {
  it("covers every content section", () => {
    // A section the CMS cannot reach is content nobody can edit.
    expect(CMS_SECTIONS.map((s) => s.id).sort()).toEqual(
      [...CONTENT_SECTIONS].sort(),
    );
  });

  it("uses unique segments", () => {
    const segments = CMS_SECTIONS.map((s) => s.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("never collides with a reserved CMS segment", () => {
    // `/cms/tokens` is top-level, and `new`/`preview` sit inside a section.
    for (const reserved of ["tokens", "new", "preview"]) {
      expect(CMS_SECTIONS.map((s) => s.segment)).not.toContain(reserved);
    }
  });

  it("mirrors the public path in the CMS URL", () => {
    // The whole point of the segment: an editor should not hold two names for
    // one section in their head.
    for (const section of CMS_SECTIONS) {
      expect(cmsSectionPath(section.id)).toBe(`/cms${section.publicPath}`);
    }
  });

  it("keeps the one place where the segment is not the id", () => {
    // Research is plural publicly and singular in the data. This is the only
    // crossing, and it is written down here rather than in a route file.
    expect(findCmsSection("investigacion")?.segment).toBe("investigaciones");
    expect(findCmsSectionBySegment("investigaciones")?.id).toBe(
      "investigacion",
    );
    expect(findCmsSectionBySegment("investigacion")).toBeUndefined();
  });
});

describe("editable sections", () => {
  it("opens a live section", () => {
    expect(findEditableSection("guias")?.id).toBe("guias");
  });

  it("refuses a planned one", () => {
    // Shown on /cms so editors see what is coming, but not openable — a
    // half-built editor is worse than a 404.
    expect(findEditableSection("estadisticas")).toBeUndefined();
    expect(findEditableSection("investigaciones")).toBeUndefined();
  });

  it("refuses an unknown segment", () => {
    expect(findEditableSection("inventada")).toBeUndefined();
  });
});

describe("route helpers", () => {
  it("take a section id and emit its segment", () => {
    // Callers hold a `cms_page.section` value, never a URL segment.
    expect(cmsEditPath("investigacion", "abc")).toBe(
      "/cms/investigaciones/abc",
    );
    expect(cmsPreviewPath("investigacion", "abc")).toBe(
      "/cms/investigaciones/preview/abc",
    );
    expect(cmsEditPath("guias", "abc")).toBe("/cms/guias/abc");
  });
});
