import type { ContentSection } from "@/content-system/types";
import type { ComponentAuthoringGroup } from "@/content-system/components/definitions";

export type { ComponentAuthoringGroup } from "@/content-system/components/definitions";

/** The presentation buckets used by the editor. They describe how a long
 * manifest should be browsed; they do not decide whether a component is
 * allowed in a section. That decision remains in the content manifest. */
export const COMPONENT_AUTHORING_GROUPS: readonly {
  id: ComponentAuthoringGroup;
  label: string;
  rank: number;
}[] = [
  { id: "article-structure", label: "Estructura del artículo", rank: 10 },
  { id: "calls-to-action", label: "Llamadas a la acción", rank: 20 },
  { id: "charts-summaries", label: "Gráficos y resúmenes", rank: 30 },
  { id: "maps", label: "Mapas", rank: 40 },
  {
    id: "tables-comparisons",
    label: "Tablas, comparaciones y datos",
    rank: 50,
  },
] as const;

export type ComponentPropertyType = "string" | "boolean";

/** JSON-serializable property information extracted from a Zod schema. */
export type ComponentPropertyDescriptor = {
  name: string;
  required: boolean;
  type: ComponentPropertyType;
  values?: readonly string[];
  pattern?: string;
  description?: string;
  placeholder?: string;
};

/** The template stays serializable until the CodeMirror client turns it into
 * an active snippet. `preview` is the same source with tab-stop markers
 * materialised, which is useful in help panels and tests. */
export type ComponentInsertTemplate = {
  snippet: string;
  preview: string;
};

export type ComponentCompletionDescriptor = {
  name: string;
  kind: "leaf" | "container";
  /** Short author-facing name shown beside the exact JSX name. */
  label: string;
  group: ComponentAuthoringGroup;
  rank: number;
  description: string;
  props: readonly ComponentPropertyDescriptor[];
  template: ComponentInsertTemplate;
  notes: readonly string[];
};

export type ComponentRecipeDescriptor = {
  id: string;
  label: string;
  description: string;
  sections: readonly ContentSection[];
  components: readonly string[];
  template: ComponentInsertTemplate;
};
