import type { MDXComponents } from "mdx/types";
import { createElement, type ComponentType } from "react";
import { EmbedFigure } from "@/components/figures/EmbedFigure";
import { componentNameToSlug } from "@/components/figures/embedPaths";
import {
  CONTENT_COMPONENT_DEFINITIONS,
  type ContentComponentDefinition,
  type ContentComponentName,
} from "./definitions";
import {
  SECTION_COMPONENT_BINDINGS,
  type SectionComponentName,
} from "./sectionBindings";

export type EmbedSection = "estadisticas" | "investigaciones";

function isEmbeddableDefinition(
  definition: ContentComponentDefinition,
): boolean {
  return (
    (definition.authoring.group === "maps" ||
      definition.authoring.group === "charts-summaries") &&
    definition.sections.some(
      (section) => section === "estadisticas" || section === "investigaciones",
    )
  );
}

export const EMBEDDABLE_COMPONENT_NAMES = (
  Object.keys(SECTION_COMPONENT_BINDINGS) as SectionComponentName[]
).filter((name) =>
  isEmbeddableDefinition(
    CONTENT_COMPONENT_DEFINITIONS[name as ContentComponentName],
  ),
);

export function embeddableComponentForSlug(slug: string):
  | {
      name: SectionComponentName;
      component: ComponentType<never>;
      definition: ContentComponentDefinition;
    }
  | undefined {
  const name = EMBEDDABLE_COMPONENT_NAMES.find(
    (candidate) => componentNameToSlug(candidate) === slug,
  );
  if (!name) return undefined;

  return {
    name,
    component: SECTION_COMPONENT_BINDINGS[name],
    definition: CONTENT_COMPONENT_DEFINITIONS[
      name as ContentComponentName
    ] as ContentComponentDefinition,
  };
}

/** Override the raw MDX bindings only on public statistics/research articles.
 * CMS previews keep the raw figures, while readers get the shareable shell. */
export function embeddableContentComponents({
  sourceHref,
  section,
}: {
  sourceHref: string;
  section: EmbedSection;
}): MDXComponents {
  return Object.fromEntries(
    EMBEDDABLE_COMPONENT_NAMES.flatMap((name) => {
      const definition = CONTENT_COMPONENT_DEFINITIONS[
        name as ContentComponentName
      ] as ContentComponentDefinition;
      if (!definition.sections.includes(section)) return [];

      const Figure = SECTION_COMPONENT_BINDINGS[name] as ComponentType<
        Record<string, unknown>
      >;
      const Wrapped = (props: Record<string, unknown>) => (
        <EmbedFigure
          sourceHref={sourceHref}
          section={section}
          componentName={name}
          componentProps={props}
          title={definition.authoring.label}
        >
          {createElement(Figure, props)}
        </EmbedFigure>
      );
      Wrapped.displayName = `Embeddable${name}`;
      return [[name, Wrapped]];
    }),
  ) as MDXComponents;
}
