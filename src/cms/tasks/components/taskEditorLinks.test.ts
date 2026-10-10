import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { linkAt, openableUrl } from "./taskEditorLinks";

function stateOf(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** The link under the first occurrence of `needle` in `doc`. */
function linkOn(doc: string, needle: string) {
  return linkAt(stateOf(doc), doc.indexOf(needle) + 1);
}

describe("task editor links", () => {
  it("opens the address of a Markdown link from its text or its URL", () => {
    const doc = "Ver [la guía](https://factura.uno/guias) antes.";
    expect(linkOn(doc, "guía")).toBe("https://factura.uno/guias");
    expect(linkOn(doc, "factura.uno")).toBe("https://factura.uno/guias");
    expect(linkOn(doc, "antes")).toBeNull();
  });

  it("opens bare URLs, www. addresses, autolinks and emails", () => {
    expect(linkOn("PR: https://github.com/a/b/pull/1 ok", "github")).toBe(
      "https://github.com/a/b/pull/1",
    );
    expect(linkOn("en www.example.com hoy", "example")).toBe(
      "https://www.example.com",
    );
    expect(linkOn("<https://example.com/x>", "example")).toBe(
      "https://example.com/x",
    );
    expect(linkOn("escribir a ana@example.com", "ana")).toBe(
      "mailto:ana@example.com",
    );
  });

  it("finds links inside list and task items", () => {
    expect(linkOn("- [ ] revisar https://example.com/a", "example")).toBe(
      "https://example.com/a",
    );
  });

  it("never opens script or relative addresses", () => {
    expect(openableUrl("javascript:alert(1)")).toBeNull();
    expect(openableUrl("/cms/tasks")).toBeNull();
    expect(linkOn("[x](javascript:alert(1))", "x")).toBeNull();
    expect(openableUrl("MAILTO:a@b.co")).toBe("MAILTO:a@b.co");
  });
});
