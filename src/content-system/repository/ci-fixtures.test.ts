import { describe, expect, it } from "vitest";
import { CONTENT_SECTIONS } from "../types";
import {
  CI_CONTENT_CATEGORIES,
  CI_CONTENT_FIXTURE_PATHS,
  CI_CONTENT_FIXTURES,
  CiFixtureContentRepository,
} from "./ci-fixtures";

describe("CI content fixtures", () => {
  const repository = new CiFixtureContentRepository();

  it("has exactly one published document per CMS section", async () => {
    expect(CI_CONTENT_FIXTURES).toHaveLength(CONTENT_SECTIONS.length);
    for (const section of CONTENT_SECTIONS) {
      const documents = await repository.listPublished(section);
      expect(documents).toHaveLength(1);
      expect(documents[0].section).toBe(section);
    }
  });

  it("has one active category per section and categorizes its fixture", () => {
    expect(CI_CONTENT_CATEGORIES).toHaveLength(CONTENT_SECTIONS.length);

    for (const section of CONTENT_SECTIONS) {
      const [category] = CI_CONTENT_CATEGORIES.filter(
        (item) => item.section === section && item.retiredAt === null,
      );
      const [document] = CI_CONTENT_FIXTURES.filter(
        (item) => item.section === section,
      );

      expect(category).toBeDefined();
      expect(document?.metadata.categories).toContain(category?.key);
    }
  });

  it("resolves every discovery path through the repository", async () => {
    const sectionForPath = {
      guias: "guias",
      noticias: "noticias",
      estadisticas: "estadisticas",
      investigaciones: "investigaciones",
    } as const;

    for (const pathname of CI_CONTENT_FIXTURE_PATHS) {
      const [, segment, ...slug] = pathname.split("/");
      const section = sectionForPath[segment as keyof typeof sectionForPath];
      expect(await repository.getByPath(section, slug)).not.toBeNull();
    }
  });
});
