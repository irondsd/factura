import {
  type Completion,
  type CompletionResult,
  type CompletionSection,
  type CompletionSource,
  snippet,
} from "@codemirror/autocomplete";
import type { ContentSection } from "@/content-system/types";
import {
  detectCompletionContext,
  type SourceCompletionContext,
} from "./context";
import { snippetField } from "./snippets";
import type {
  ComponentAuthoringGroup,
  ComponentCompletionDescriptor,
  ComponentPropertyDescriptor,
  ComponentRecipeDescriptor,
} from "./types";
import { COMPONENT_AUTHORING_GROUPS } from "./types";

export const COMPONENT_ASSISTANT_SHORTCUT = "Mod-Shift-k";

const GROUP_LABELS = new Map(
  COMPONENT_AUTHORING_GROUPS.map((group) => [group.id, group.label]),
);

const COMPONENT_SECTIONS = new Map<
  ComponentAuthoringGroup,
  CompletionSection
>();

function completionSection(group: ComponentAuthoringGroup): CompletionSection {
  const existing = COMPONENT_SECTIONS.get(group);
  if (existing) return existing;

  const section: CompletionSection = {
    name: GROUP_LABELS.get(group) ?? group,
    rank: COMPONENT_AUTHORING_GROUPS.find((item) => item.id === group)?.rank,
    header: (current) => sectionHeader(current.name, true),
  };
  COMPONENT_SECTIONS.set(group, section);
  return section;
}

const PROPERTY_SECTION: CompletionSection = {
  name: "Propiedades",
  rank: 10,
  header: (section) => sectionHeader(section.name, true),
};

const VALUE_SECTION: CompletionSection = {
  name: "Valores permitidos",
  rank: 10,
  header: (section) => sectionHeader(section.name, true),
};

const RECIPE_SECTION: CompletionSection = {
  name: "Recetas",
  rank: 0,
  header: (section) => sectionHeader(section.name, true),
};

export type CompletionBuildOptions = {
  explicit: boolean;
  section?: ContentSection;
  platform?: string;
};

/** Build the CodeMirror result for a previously detected source context. The
 * function has no editor state or DOM dependency until a completion's help is
 * actually selected, which keeps the matching and insertion behavior easy to
 * exercise in unit tests. */
export function completionResultForContext(
  context: SourceCompletionContext,
  descriptors: readonly ComponentCompletionDescriptor[],
  recipes: readonly ComponentRecipeDescriptor[],
  options: CompletionBuildOptions,
): CompletionResult | null {
  if (context.kind === "excluded") return null;

  switch (context.kind) {
    case "component-name":
      return componentNameResult(context, descriptors, options.platform);
    case "closing-name":
      return closingNameResult(context, descriptors, options.platform);
    case "property-name":
      return propertyNameResult(context, descriptors, options.platform);
    case "property-value":
      return propertyValueResult(context, descriptors, options.platform);
    case "neutral":
      if (!options.explicit) return null;
      return neutralResult(context, descriptors, recipes, options.platform);
  }
}

export function componentCompletionSource(
  descriptors: readonly ComponentCompletionDescriptor[],
  recipes: readonly ComponentRecipeDescriptor[],
): CompletionSource {
  return (completionContext) => {
    return completionResultForContext(
      detectCompletionContext(completionContext.state, completionContext.pos),
      descriptors,
      recipes,
      { explicit: completionContext.explicit },
    );
  };
}

function componentNameResult(
  context: Extract<SourceCompletionContext, { kind: "component-name" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  platform?: string,
): CompletionResult {
  return {
    from: context.from,
    to: context.to,
    options: descriptors.map((descriptor) =>
      componentCompletion(descriptor, platform),
    ),
    validFor: /^[A-Za-z0-9_]*$/,
  };
}

function closingNameResult(
  context: Extract<SourceCompletionContext, { kind: "closing-name" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  platform?: string,
): CompletionResult | null {
  const open = new Set(context.openContainers);
  const options = descriptors
    .filter((descriptor) => descriptor.kind === "container")
    .filter((descriptor) => open.has(descriptor.name))
    .sort(
      (a, b) =>
        context.openContainers.indexOf(a.name) -
          context.openContainers.indexOf(b.name) ||
        a.name.localeCompare(b.name),
    )
    .map((descriptor) => ({
      label: descriptor.name,
      detail: `cerrar · ${descriptor.label}`,
      type: "type",
      section: completionSection(descriptor.group),
      info: () => completionHelpElement(closingHelpText(descriptor, platform)),
    }));

  return options.length
    ? {
        from: context.from,
        to: context.to,
        options,
        validFor: /^[A-Za-z0-9_]*$/,
      }
    : null;
}

function propertyNameResult(
  context: Extract<SourceCompletionContext, { kind: "property-name" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  platform?: string,
): CompletionResult | null {
  const descriptor = descriptors.find(
    (candidate) => candidate.name === context.componentName,
  );
  if (!descriptor || descriptor.props.length === 0) return null;

  const used = new Set(context.usedProperties);
  const options = descriptor.props
    .filter((property) => !used.has(property.name))
    .map((property) => propertyCompletion(descriptor, property, platform));

  return options.length
    ? {
        from: context.from,
        to: context.to,
        options,
        validFor: /^[A-Za-z0-9_.:-]*$/,
      }
    : null;
}

function propertyValueResult(
  context: Extract<SourceCompletionContext, { kind: "property-value" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  platform?: string,
): CompletionResult | null {
  const descriptor = descriptors.find(
    (candidate) => candidate.name === context.componentName,
  );
  const property = descriptor?.props.find(
    (candidate) => candidate.name === context.propertyName,
  );
  if (!descriptor || !property) return null;

  const values = property.values?.length
    ? [...property.values]
    : property.type === "boolean"
      ? ["true", "false"]
      : property.placeholder
        ? [property.placeholder]
        : [];
  if (values.length === 0) return null;

  return {
    from: context.from,
    to: context.to,
    options: values.map((value) => ({
      label: value,
      detail: property.values?.length
        ? `${property.name} · permitido`
        : `${property.name} · sugerencia editable`,
      type: property.type === "boolean" ? "constant" : "value",
      section: VALUE_SECTION,
      info: () =>
        completionHelpElement(
          propertyValueHelpText(descriptor, property, platform),
        ),
      apply: context.quote ? value : `"${escapeAttribute(value)}"`,
    })),
    validFor: /^[^"']*$/,
  };
}

function neutralResult(
  context: Extract<SourceCompletionContext, { kind: "neutral" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  recipes: readonly ComponentRecipeDescriptor[],
  platform?: string,
): CompletionResult {
  const recipeOptions = recipes.map((recipe) =>
    recipeCompletion(recipe, platform),
  );
  const componentOptions = descriptors.map((descriptor) =>
    componentCompletion(descriptor, platform),
  );
  return {
    from: context.from,
    to: context.to,
    options: [...recipeOptions, ...componentOptions],
    validFor: /^[A-Za-z0-9_-]*$/,
  };
}

function componentCompletion(
  descriptor: ComponentCompletionDescriptor,
  platform?: string,
): Completion {
  return {
    label: descriptor.name,
    detail: `${descriptor.label} · ${kindLabel(descriptor.kind)}`,
    type: descriptor.kind === "container" ? "type" : "class",
    sortText: `${String(descriptor.rank).padStart(8, "0")}${descriptor.name}`,
    section: completionSection(descriptor.group),
    info: () => completionHelpElement(componentHelpText(descriptor, platform)),
    apply: (view, completion, from, to) => {
      // The completion range starts after `<` so CodeMirror can match `Clos`
      // against the option label. The snippet, however, replaces the whole
      // partial tag and therefore consumes that one preceding `<` exactly once.
      const before = from > 0 ? view.state.doc.sliceString(from - 1, from) : "";
      snippet(descriptor.template.snippet)(
        view,
        completion,
        before === "<" ? from - 1 : from,
        to,
      );
    },
  };
}

function propertyCompletion(
  descriptor: ComponentCompletionDescriptor,
  property: ComponentPropertyDescriptor,
  platform?: string,
): Completion {
  const defaultValue =
    property.values?.[0] ??
    property.placeholder ??
    (property.type === "boolean" ? "false" : "");
  const propertySnippet =
    property.type === "boolean"
      ? `${property.name}${snippetField(0, "")}`
      : `${property.name}="${snippetField(1, defaultValue)}"${snippetField(0, "")}`;

  return {
    label: property.name,
    detail: `${property.required ? "obligatoria" : "opcional"} · ${property.type}`,
    type: "property",
    section: PROPERTY_SECTION,
    info: () =>
      completionHelpElement(propertyHelpText(descriptor, property, platform)),
    apply: snippet(propertySnippet),
  };
}

function recipeCompletion(
  recipe: ComponentRecipeDescriptor,
  platform?: string,
): Completion {
  return {
    label: recipe.label,
    displayLabel: recipe.label,
    detail: "receta · varios componentes",
    type: "keyword",
    sortText: `00000000${recipe.label}`,
    section: RECIPE_SECTION,
    info: () => completionHelpElement(recipeHelpText(recipe, platform)),
    apply: snippet(recipe.template.snippet),
  };
}

export function componentHelpText(
  descriptor: ComponentCompletionDescriptor,
  platform?: string,
): string {
  const props = descriptor.props.length
    ? descriptor.props.map(propertyHelpLine).join("\n")
    : "  (sin propiedades)";
  return [
    `${descriptor.name} · ${kindLabel(descriptor.kind)}`,
    `Sintaxis inicial:\n${descriptor.template.preview}`,
    `Descripción: ${descriptor.description}`,
    "Propiedades:",
    props,
    ...(descriptor.notes.length > 0
      ? ["Notas:", ...descriptor.notes.map((note) => `  • ${note}`)]
      : []),
    shortcutHint(platform),
  ].join("\n");
}

function propertyHelpText(
  descriptor: ComponentCompletionDescriptor,
  property: ComponentPropertyDescriptor,
  platform?: string,
): string {
  return [
    `${property.name} en <${descriptor.name}>`,
    `${property.required ? "Obligatoria" : "Opcional"} · ${property.type}`,
    property.description ? `Descripción: ${property.description}` : "",
    property.values?.length ? `Valores: ${property.values.join(", ")}` : "",
    property.pattern ? `Patrón: ${property.pattern}` : "",
    property.placeholder ? `Sugerencia inicial: ${property.placeholder}` : "",
    shortcutHint(platform),
  ]
    .filter(Boolean)
    .join("\n");
}

function propertyValueHelpText(
  descriptor: ComponentCompletionDescriptor,
  property: ComponentPropertyDescriptor,
  platform?: string,
): string {
  return [
    `${property.name} en <${descriptor.name}>`,
    property.description ?? "Valor literal permitido por el esquema.",
    property.values?.length
      ? `Valores permitidos: ${property.values.join(", ")}`
      : property.type === "boolean"
        ? "Booleano: true, false o la forma abreviada del atributo."
        : "Puedes editar esta sugerencia después de insertarla.",
    shortcutHint(platform),
  ].join("\n");
}

function closingHelpText(
  descriptor: ComponentCompletionDescriptor,
  platform?: string,
): string {
  return [
    `</${descriptor.name}>`,
    `Cierra el bloque ${descriptor.label}.`,
    descriptor.description,
    shortcutHint(platform),
  ].join("\n");
}

function recipeHelpText(
  recipe: ComponentRecipeDescriptor,
  platform?: string,
): string {
  return [
    recipe.label,
    `Inserción:\n${recipe.template.preview}`,
    recipe.description,
    `Componentes: ${recipe.components.join(", ")}`,
    shortcutHint(platform),
  ].join("\n");
}

function propertyHelpLine(property: ComponentPropertyDescriptor): string {
  const required = property.required ? "obligatoria" : "opcional";
  const values = property.values?.length
    ? ` · valores: ${property.values.join(", ")}`
    : "";
  return `  ${property.name} (${required}, ${property.type})${values}`;
}

export function shortcutLabel(
  platform?: string,
): "Cmd+Shift+K" | "Ctrl+Shift+K" {
  const value =
    platform ??
    (typeof navigator === "undefined"
      ? ""
      : `${navigator.platform} ${navigator.userAgent}`);
  return /Mac|iPhone|iPad|iPod/i.test(value) ? "Cmd+Shift+K" : "Ctrl+Shift+K";
}

export function shortcutHint(platform?: string): string {
  return `Atajo: ${shortcutLabel(platform)} para abrir el asistente.`;
}

function completionHelpElement(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "cms-completion-help";
  const pre = document.createElement("pre");
  pre.textContent = text;
  element.appendChild(pre);
  return element;
}

function sectionHeader(name: string, withHint: boolean): HTMLElement {
  const element = document.createElement("div");
  element.className = "cms-completion-section-header";
  const title = document.createElement("span");
  title.textContent = name;
  element.appendChild(title);
  if (withHint) {
    const hint = document.createElement("span");
    hint.className = "cms-completion-shortcut";
    hint.textContent = shortcutHint();
    element.appendChild(hint);
  }
  return element;
}

function kindLabel(kind: "leaf" | "container"): string {
  return kind === "leaf" ? "componente sin cierre" : "bloque con contenido";
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
