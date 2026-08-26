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

const GROUP_RANKS = new Map(
  COMPONENT_AUTHORING_GROUPS.map((group) => [group.id, group.rank]),
);

/** CodeMirror groups options under section headers, and those headers are the
 * only chrome the popup has to teach the shortcut with. It is shown once, on
 * whichever section sorts to the top of *this* result — repeating it above all
 * five component groups turned the list into an advertisement. Sections are
 * therefore built per result rather than shared: which one carries the hint
 * depends on which groups the result actually contains. */
function sectionBuilder(platform?: string) {
  const built = new Map<string, CompletionSection>();
  let hinted: CompletionSection | undefined;

  return (name: string, rank: number): CompletionSection => {
    const existing = built.get(name);
    if (existing) return existing;

    const section: CompletionSection = {
      name,
      rank,
      header: (current) =>
        sectionHeader(current.name, current === hinted, platform),
    };
    built.set(name, section);
    if (!hinted || rank < (hinted.rank as number)) hinted = section;
    return section;
  };
}

type SectionBuilder = ReturnType<typeof sectionBuilder>;

function groupSection(
  buildSection: SectionBuilder,
  group: ComponentAuthoringGroup,
): CompletionSection {
  return buildSection(
    GROUP_LABELS.get(group) ?? group,
    GROUP_RANKS.get(group) ?? 999,
  );
}

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
  const buildSection = sectionBuilder(platform);
  return {
    from: context.from,
    to: context.to,
    options: descriptors.map((descriptor) =>
      componentCompletion(descriptor, buildSection, platform),
    ),
    validFor: /^[A-Za-z0-9_]*$/,
  };
}

function closingNameResult(
  context: Extract<SourceCompletionContext, { kind: "closing-name" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  platform?: string,
): CompletionResult | null {
  const buildSection = sectionBuilder(platform);
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
    .map(
      (descriptor): Completion => ({
        label: descriptor.name,
        detail: `cerrar · ${descriptor.label}`,
        type: "type",
        section: groupSection(buildSection, descriptor.group),
        info: () =>
          completionHelpElement(closingHelpText(descriptor, platform)),
        // Finish the tag as well as the name — `</ClosingCta` on its own is a
        // parse error, and it is the whole point of picking from this list.
        apply: (view, _completion, from, to) => {
          const closed = view.state.doc.sliceString(to, to + 1) === ">";
          const text = closed ? descriptor.name : `${descriptor.name}>`;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length + (closed ? 1 : 0) },
            userEvent: "input.complete",
          });
        },
      }),
    );

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

  const buildSection = sectionBuilder(platform);
  const used = new Set(context.usedProperties);
  const options = descriptor.props
    .filter((property) => !used.has(property.name))
    .map((property) =>
      propertyCompletion(descriptor, property, buildSection, platform),
    );

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

  const buildSection = sectionBuilder(platform);
  return {
    from: context.from,
    to: context.to,
    options: values.map((value) => ({
      label: value,
      detail: property.values?.length
        ? `${property.name} · permitido`
        : `${property.name} · sugerencia editable`,
      type: property.type === "boolean" ? "constant" : "value",
      section: buildSection("Valores permitidos", 10),
      info: () =>
        completionHelpElement(
          propertyValueHelpText(descriptor, property, platform),
        ),
      apply: applyPropertyValue(value, context.quote),
    })),
    validFor: /^[^"']*$/,
  };
}

/** Replace the *whole* value, not just the part before the cursor. The
 * completion range stops at the cursor so the popup filters on what has been
 * typed, but an author who clicks into an existing `region="gba"` to change it
 * has the rest of the value sitting to the right; inserting there would leave
 * `region="nacionalgba"`. */
function applyPropertyValue(
  value: string,
  quote?: string,
): Completion["apply"] {
  const text = quote ? value : `"${escapeAttribute(value)}"`;
  return (view, _completion, from, to) => {
    const end = quote ? valueEnd(view.state.doc.toString(), to, quote) : to;
    view.dispatch({
      changes: { from, to: end, insert: text },
      selection: { anchor: from + text.length },
      userEvent: "input.complete",
    });
  };
}

function valueEnd(source: string, from: number, quote: string): number {
  for (let cursor = from; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "\n" || character === ">") return from;
    if (character === quote && source[cursor - 1] !== "\\") return cursor;
  }
  return from;
}

function neutralResult(
  context: Extract<SourceCompletionContext, { kind: "neutral" }>,
  descriptors: readonly ComponentCompletionDescriptor[],
  recipes: readonly ComponentRecipeDescriptor[],
  platform?: string,
): CompletionResult {
  const buildSection = sectionBuilder(platform);
  const recipeOptions = recipes.map((recipe) =>
    recipeCompletion(recipe, buildSection, platform),
  );
  const componentOptions = descriptors.map((descriptor) =>
    componentCompletion(descriptor, buildSection, platform),
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
  buildSection: SectionBuilder,
  platform?: string,
): Completion {
  return {
    label: descriptor.name,
    // The Spanish label is display-only: CodeMirror matches the typed text
    // against `label`, which has to stay the exact JSX name.
    detail: `${descriptor.label} · ${kindLabel(descriptor.kind)}`,
    type: descriptor.kind === "container" ? "type" : "class",
    sortText: `${String(descriptor.rank).padStart(8, "0")}${descriptor.name}`,
    section: groupSection(buildSection, descriptor.group),
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
  buildSection: SectionBuilder,
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
    section: buildSection("Propiedades", 10),
    info: () =>
      completionHelpElement(propertyHelpText(descriptor, property, platform)),
    apply: snippet(propertySnippet),
  };
}

function recipeCompletion(
  recipe: ComponentRecipeDescriptor,
  buildSection: SectionBuilder,
  platform?: string,
): Completion {
  return {
    label: recipe.label,
    displayLabel: recipe.label,
    detail: "receta · varios componentes",
    type: "keyword",
    sortText: `00000000${recipe.label}`,
    section: buildSection("Recetas", 0),
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

function sectionHeader(
  name: string,
  withHint: boolean,
  platform?: string,
): HTMLElement {
  const element = document.createElement("div");
  element.className = "cms-completion-section-header";
  const title = document.createElement("span");
  title.textContent = name;
  element.appendChild(title);
  if (withHint) {
    const hint = document.createElement("span");
    hint.className = "cms-completion-shortcut";
    hint.textContent = shortcutHint(platform);
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
