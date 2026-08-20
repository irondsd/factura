import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS } from "@/content-system/types";
import {
  CMS_SECTIONS,
  cmsEditPath,
  cmsPreviewPath,
  cmsSectionPath,
  findCmsSection,
  findEditableSection,
  publicSectionPath,
} from "./sections";

describe("the section registry", () => {
  it("covers every content section", () => {
    // A section the CMS cannot reach is content nobody can edit.
    expect(CMS_SECTIONS.map((s) => s.id).sort()).toEqual(
      [...CONTENT_SECTIONS].sort(),
    );
  });

  it("uses unique ids", () => {
    const ids = CMS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every section in the plural", () => {
    // The id is the reader-facing URL segment, and the site's sections are
    // plural: /guias, /estadisticas, /investigaciones. Research shipped
    // singular once, which put one name in the URLs and another in the data
    // until it was renamed. A new section is named in the plural from the
    // start so that never has to happen twice.
    for (const section of CMS_SECTIONS) {
      expect(section.id).toMatch(/s$/);
    }
  });

  it("never collides with a reserved CMS segment", () => {
    // `/cms/tokens` is top-level, and `new`/`preview` sit inside a section.
    for (const reserved of ["tokens", "new", "preview"]) {
      expect(CMS_SECTIONS.map((s) => s.id)).not.toContain(reserved);
    }
  });

  it("mirrors the public path in the CMS URL", () => {
    // An editor should not hold two names for one section in their head.
    for (const section of CMS_SECTIONS) {
      expect(cmsSectionPath(section.id)).toBe(
        `/cms${publicSectionPath(section.id)}`,
      );
    }
  });

  it("resolves a section by id", () => {
    expect(findCmsSection("investigaciones")?.label).toBe("Investigación");
    expect(findCmsSection("investigacion")).toBeUndefined();
  });
});

describe("editable sections", () => {
  it("opens a live section", () => {
    expect(findEditableSection("guias")?.id).toBe("guias");
    expect(findEditableSection("estadisticas")?.id).toBe("estadisticas");
    expect(findEditableSection("investigaciones")?.id).toBe("investigaciones");
  });

  it("refuses an unknown segment", () => {
    expect(findEditableSection("inventada")).toBeUndefined();
    // The section's retired singular name is not a way in.
    expect(findEditableSection("investigacion")).toBeUndefined();
  });
});

describe("route helpers", () => {
  it("build a CMS URL from a section id", () => {
    // Callers hold a `cms_page.section` value, which is the segment too.
    expect(cmsEditPath("investigaciones", "abc")).toBe(
      "/cms/investigaciones/abc",
    );
    expect(cmsPreviewPath("investigaciones", "abc")).toBe(
      "/cms/investigaciones/preview/abc",
    );
    expect(cmsEditPath("guias", "abc")).toBe("/cms/guias/abc");
  });
});
