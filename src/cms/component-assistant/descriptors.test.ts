import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CONTENT_COMPONENT_DEFINITIONS,
  CONTENT_COMPONENT_NAMES,
  componentDefinition,
  componentsForSection,
} from "@/content-system/components/definitions";
import { validateGrammar } from "@/content-system/validation/grammar";
import { CONTENT_SECTIONS } from "@/content-system/types";
import { SECTION_COMPONENT_NAMES } from "@/content-system/components/sectionDefinitions";
import {
  componentCompletionDescriptors,
  descriptorForComponent,
} from "./descriptors";
import { allComponentRecipes, componentRecipesForSection } from "./recipes";

type JsonSchema = {
  properties?: Record<
    string,
    { type?: string; enum?: unknown[]; pattern?: string }
  >;
  required?: string[];
};

describe("component completion descriptors", () => {
  it("projects every registered component", () => {
    for (const name of CONTENT_COMPONENT_NAMES) {
      const definition = componentDefinition(name);
      expect(definition, name).toBeDefined();
      expect(descriptorForComponent(name, definition!)).toMatchObject({ name });
    }
  });

  it("matches the manifest allowlist for each section", () => {
    for (const section of CONTENT_SECTIONS) {
      expect(
        componentCompletionDescriptors(section)
          .map((descriptor) => descriptor.name)
          .sort(),
      ).toEqual([...componentsForSection(section)].sort());
    }
  });

  it("does not offer data visualizations to guides or news", () => {
    for (const section of ["guias", "noticias"] as const) {
      const names = new Set(
        componentCompletionDescriptors(section).map(
          (descriptor) => descriptor.name,
        ),
      );
      expect(names).not.toContain("IpcViviendaChart");
      expect(names).not.toContain("AlquilerCabaMapa");
      expect(names).not.toContain("VentaCabaMapa");
      expect(names).not.toContain("BarriosSubestimadosResumen");
    }
  });

  it("includes the registered data catalogue in data sections", () => {
    for (const section of ["estadisticas", "investigaciones"] as const) {
      const names = new Set(
        componentCompletionDescriptors(section).map(
          (descriptor) => descriptor.name,
        ),
      );
      const allowed = new Set<string>(componentsForSection(section));
      for (const name of SECTION_COMPONENT_NAMES) {
        if (allowed.has(name)) expect(names).toContain(name);
      }
    }
  });

  it("projects property names, types, requiredness, enums, and patterns from Zod", () => {
    for (const name of CONTENT_COMPONENT_NAMES) {
      const definition = CONTENT_COMPONENT_DEFINITIONS[name];
      const descriptor = descriptorForComponent(name, definition);
      const schema = z.toJSONSchema(definition.props) as JsonSchema;
      expect(descriptor.props.map((property) => property.name)).toEqual(
        Object.keys(schema.properties ?? {}),
      );
      for (const property of descriptor.props) {
        const schemaProperty = schema.properties?.[property.name];
        expect(schemaProperty).toBeDefined();
        expect(property.required).toBe(
          schema.required?.includes(property.name) ?? false,
        );
        expect(property.type).toBe(
          schemaProperty?.type === "boolean" ? "boolean" : "string",
        );
        if (schemaProperty?.enum)
          expect(property.values).toEqual(schemaProperty.enum);
        if (schemaProperty?.pattern)
          expect(property.pattern).toBe(schemaProperty.pattern);
      }
    }
  });

  it("does not expose unknown properties", () => {
    for (const section of CONTENT_SECTIONS) {
      for (const descriptor of componentCompletionDescriptors(section)) {
        const schema = z.toJSONSchema(
          componentDefinition(descriptor.name)!.props,
        ) as JsonSchema;
        expect(descriptor.props.map((property) => property.name)).toEqual(
          Object.keys(schema.properties ?? {}),
        );
      }
    }
  });

  it("generates grammar-valid snippets for every allowed section", () => {
    for (const section of CONTENT_SECTIONS) {
      for (const descriptor of componentCompletionDescriptors(section)) {
        const result = validateGrammar(descriptor.template.preview, section);
        expect(result.diagnostics, `${section}/${descriptor.name}`).toEqual([]);
      }
    }
  });
});

describe("component recipes", () => {
  it("are grammar-valid in every advertised section and filtered elsewhere", () => {
    for (const recipe of allComponentRecipes()) {
      for (const section of recipe.sections) {
        expect(
          validateGrammar(recipe.template.preview, section).diagnostics,
          `${recipe.id}/${section}`,
        ).toEqual([]);
        expect(
          componentRecipesForSection(section).map((item) => item.id),
        ).toContain(recipe.id);
      }
      for (const section of CONTENT_SECTIONS.filter(
        (candidate) => !recipe.sections.includes(candidate),
      )) {
        expect(
          componentRecipesForSection(section).map((item) => item.id),
        ).not.toContain(recipe.id);
      }
    }
  });

  it("keeps guide sources out of the guide-ending recipe", () => {
    const guide = componentRecipesForSection("guias").find(
      (recipe) => recipe.id === "guide-ending",
    );
    expect(guide?.components).toEqual(["Faq", "RelatedGuides", "ClosingCta"]);
    expect(guide?.template.preview).not.toContain("<Fuentes />");
  });

  it("offers the data ending only to data sections", () => {
    expect(
      componentRecipesForSection("estadisticas").map((recipe) => recipe.id),
    ).toContain("data-page-ending");
    expect(
      componentRecipesForSection("investigaciones").map((recipe) => recipe.id),
    ).toContain("data-page-ending");
    expect(
      componentRecipesForSection("guias").map((recipe) => recipe.id),
    ).not.toContain("data-page-ending");
  });
});
