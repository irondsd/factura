import {
  componentsForSection,
  type ContentComponentName,
} from "@/content-system/components/definitions";
import type { ContentSection } from "@/content-system/types";
import { materializeSnippet, snippetField } from "./snippets";
import type { ComponentRecipeDescriptor } from "./types";

const RECIPE_DEFINITIONS: readonly Omit<
  ComponentRecipeDescriptor,
  "template"
>[] = [
  {
    id: "guide-ending",
    label: "Cierre de guía",
    description:
      "Añade FAQ, guías relacionadas y un cierre con título y copy específicos.",
    sections: ["guias"],
    components: ["Faq", "RelatedGuides", "ClosingCta"],
  },
  {
    id: "cta-button-row",
    label: "Fila de botones",
    description: "Inserta una fila con los botones de demo y registro.",
    sections: ["guias"],
    components: ["CtaRow", "DemoCta", "SignupCta"],
  },
  {
    id: "data-page-ending",
    label: "Cierre de página de datos",
    description: "Añade el cierre de la página y sus fuentes al final.",
    sections: ["estadisticas", "investigaciones"],
    components: ["ClosingCta", "Fuentes"],
  },
];

const RECIPE_SNIPPETS: Record<string, string> = {
  "guide-ending": `<Faq />

<RelatedGuides />

<ClosingCta title="${snippetField(1, "Título específico")}">

${snippetField(0, "Dos frases relacionadas con esta guía.")}

</ClosingCta>`,
  "cta-button-row": `<CtaRow>

<DemoCta />

<SignupCta />

</CtaRow>${snippetField(0, "")}`,
  "data-page-ending": `<ClosingCta title="${snippetField(1, "Título específico")}">

${snippetField(0, "Dos frases relacionadas con esta página.")}

</ClosingCta>

<Fuentes />`,
};

/** Recipes are editor actions rather than renderable components. Their list is
 * kept small and explicit, while the actual section filter still checks the
 * live manifest so a recipe cannot advertise a component that a section no
 * longer allows. */
export function componentRecipesForSection(
  section: ContentSection,
): ComponentRecipeDescriptor[] {
  const allowed = new Set(componentsForSection(section));
  return RECIPE_DEFINITIONS.filter(
    (recipe) =>
      recipe.sections.includes(section) &&
      recipe.components.every((name) =>
        allowed.has(name as ContentComponentName),
      ),
  ).map(withTemplate);
}

export function allComponentRecipes(): readonly ComponentRecipeDescriptor[] {
  return RECIPE_DEFINITIONS.map(withTemplate);
}

function withTemplate(
  recipe: (typeof RECIPE_DEFINITIONS)[number],
): ComponentRecipeDescriptor {
  const snippet = RECIPE_SNIPPETS[recipe.id];
  if (!snippet) throw new Error(`Missing snippet for recipe ${recipe.id}`);
  return {
    ...recipe,
    template: { snippet, preview: materializeSnippet(snippet) },
  };
}
