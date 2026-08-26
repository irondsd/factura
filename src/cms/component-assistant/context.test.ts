import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { componentCompletionDescriptors } from "./descriptors";
import {
  componentHelpText,
  completionResultForContext,
  shortcutHint,
} from "./completions";
import { detectCompletionContext, detectSourceContext } from "./context";
import { componentRecipesForSection } from "./recipes";

const guideDescriptors = () => componentCompletionDescriptors("guias");
const dataDescriptors = () => componentCompletionDescriptors("estadisticas");

describe("component assistant context", () => {
  it("detects a component name and the replacement range", () => {
    expect(detectSourceContext("<")).toMatchObject({
      kind: "component-name",
      from: 1,
      to: 1,
      query: "",
      tagStart: 0,
    });
    expect(detectSourceContext("texto\n<Ip")).toMatchObject({
      kind: "component-name",
      from: 7,
      to: 9,
      query: "Ip",
      tagStart: 6,
    });
  });

  it("does not treat inline or fenced code as component source", () => {
    expect(detectSourceContext("`<Ipc")).toMatchObject({
      kind: "excluded",
      reason: "inline-code",
    });
    expect(detectSourceContext("```mdx\n<Ipc")).toMatchObject({
      kind: "excluded",
      reason: "fenced-code",
    });

    const source = "```mdx\n<Ipc\n```\n<";
    const state = EditorState.create({
      doc: source,
      selection: { anchor: source.length },
      extensions: [markdown({ base: markdownLanguage })],
    });
    expect(detectCompletionContext(state).kind).toBe("component-name");
  });

  it("uses the syntax tree for an inline-code exclusion at the cursor", () => {
    const source = "`<Ipc`";
    const state = EditorState.create({
      doc: source,
      selection: { anchor: 4 },
      extensions: [markdown({ base: markdownLanguage })],
    });
    expect(detectCompletionContext(state)).toMatchObject({
      kind: "excluded",
      reason: "inline-code",
    });
  });

  it("handles multiline tags and a quoted greater-than sign", () => {
    const source = '<IpcViviendaChart\n region="g>ba"\n variacion="';
    expect(detectSourceContext(source)).toMatchObject({
      kind: "property-value",
      componentName: "IpcViviendaChart",
      propertyName: "variacion",
      query: "",
    });
    expect(detectSourceContext('<IpcViviendaChart region="g>')).toMatchObject({
      kind: "property-value",
      propertyName: "region",
      query: "g>",
    });
  });

  it("distinguishes a quoted property value from a component insertion", () => {
    expect(detectSourceContext('<CtaButton href="<Ipc')).toMatchObject({
      kind: "property-value",
      propertyName: "href",
      query: "<Ipc",
    });
  });

  it("tracks open containers for useful closing-tag completion", () => {
    expect(detectSourceContext("<ClosingCta>\n\ncopy\n\n</Clos")).toMatchObject(
      {
        kind: "closing-name",
        query: "Clos",
        openContainers: ["ClosingCta"],
      },
    );
  });
});

describe("component assistant completions", () => {
  it("offers only section descriptors and recipes in the relevant contexts", () => {
    const guide = guideDescriptors();
    const recipes = componentRecipesForSection("guias");
    const automatic = completionResultForContext(
      detectSourceContext("<"),
      guide,
      recipes,
      { explicit: false },
    );
    expect(automatic?.options.map((option) => option.label)).toContain(
      "ClosingCta",
    );
    expect(automatic?.options.map((option) => option.label)).not.toContain(
      "IpcViviendaChart",
    );
    expect(automatic?.options.map((option) => option.label)).not.toContain(
      "guide-ending",
    );

    const explicit = completionResultForContext(
      detectSourceContext(""),
      guide,
      recipes,
      { explicit: true },
    );
    expect(explicit?.options.map((option) => option.label)).toContain(
      "Cierre de guía",
    );
    expect(explicit?.options.map((option) => option.label)).toContain("Faq");
  });

  it("suggests only unused properties with requiredness and values", () => {
    const context = detectSourceContext('<IpcViviendaChart region="gba" ');
    expect(context.kind).toBe("property-name");
    if (context.kind !== "property-name") return;
    const result = completionResultForContext(context, dataDescriptors(), [], {
      explicit: false,
    });
    expect(result?.options.map((option) => option.label)).toEqual([
      "variacion",
    ]);
    expect(result?.options[0]?.detail).toMatch(/obligatoria/);

    const valueContext = detectSourceContext('<IpcViviendaChart region="');
    const valueResult = completionResultForContext(
      valueContext,
      dataDescriptors(),
      [],
      { explicit: false },
    );
    expect(valueResult?.options.map((option) => option.label)).toEqual([
      "nacional",
      "gba",
      "pampeana",
      "noreste",
      "noroeste",
      "cuyo",
      "patagonia",
    ]);
  });

  it("offers boolean values and property insertion in grammar-safe forms", () => {
    const context = detectSourceContext('<CtaButton href="/demo" ');
    const result = completionResultForContext(context, guideDescriptors(), [], {
      explicit: true,
    });
    const boolean = result?.options.find((option) => option.label === "newTab");
    expect(boolean?.detail).toMatch(/opcional/);
    expect(boolean?.apply).toBeTypeOf("function");

    const valueContext = detectSourceContext(
      '<CtaButton href="/demo" newTab="',
    );
    const valueResult = completionResultForContext(
      valueContext,
      guideDescriptors(),
      [],
      { explicit: false },
    );
    expect(valueResult?.options.map((option) => option.label)).toEqual([
      "true",
      "false",
    ]);
  });

  it("builds safe leaf and container previews without a second opening tag", () => {
    const guide = guideDescriptors();
    const leaf = guide.find((descriptor) => descriptor.name === "Faq");
    const container = guide.find(
      (descriptor) => descriptor.name === "ClosingCta",
    );
    expect(leaf?.template.preview).toBe("<Faq />");
    expect(container?.template.preview).toContain(
      '<ClosingCta title="Título específico">',
    );
    expect(container?.template.preview).not.toContain("<<");
    expect(componentHelpText(leaf!, "Macintosh")).toContain("Cmd+Shift+K");
  });

  it("keeps the shortcut hint in completion documentation", () => {
    expect(shortcutHint("MacIntel")).toContain("Cmd+Shift+K");
    expect(shortcutHint("Linux x86_64")).toContain("Ctrl+Shift+K");
    expect(componentHelpText(guideDescriptors()[0])).toContain("Atajo:");
  });

  it("does not return completions for excluded source", () => {
    const result = completionResultForContext(
      detectSourceContext("```mdx\n<Ipc"),
      dataDescriptors(),
      [],
      { explicit: true },
    );
    expect(result).toBeNull();
  });
});
