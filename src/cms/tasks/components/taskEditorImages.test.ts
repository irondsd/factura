import { history, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { MAX_TASK_IMAGE_BYTES, taskImageKey } from "../images";
import {
  insertImage,
  insertPlaceholders,
  rejectionFor,
  removePlaceholder,
  taskImageBlocks,
} from "./taskEditorImages";

const ORIGIN = "https://media.factura.uno";
const URL_A = `${ORIGIN}/${taskImageKey("0b5f3c1e-8a7d-4e2b-9c41-6f0a2d3e4b5c", 800, 400)}`;

function stateOf(doc: string, cursor = doc.length) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), history()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

const apply = (state: EditorState, spec: TransactionSpec) =>
  state.update(spec).state;

/** What the editor does when an upload comes back: two transactions. */
function resolve(state: EditorState, token: string, url: string | null) {
  const removed = removePlaceholder(state, token);
  if (!removed) return state;
  const cleared = apply(state, removed.spec);
  return url ? apply(cleared, insertImage(cleared, removed.at, url)) : cleared;
}

function undone(state: EditorState) {
  let next = state;
  undo({ state, dispatch: (tr) => (next = tr.state) });
  return next;
}

describe("insertPlaceholders", () => {
  it("puts the placeholder on its own line and the cursor on the next", () => {
    const state = stateOf("Ejemplo:", 8);
    const next = apply(state, insertPlaceholders(state, ["t1"], { from: 8, to: 8 }));
    expect(next.doc.toString()).toBe(
      "Ejemplo:\n![Subiendo imagen…](subiendo-t1)\n",
    );
    expect(next.selection.main.head).toBe(next.doc.length);
  });

  it("splits a line when pasted in the middle of it", () => {
    const state = stateOf("antes después");
    const next = apply(state, insertPlaceholders(state, ["t1"], { from: 6, to: 6 }));
    expect(next.doc.toString()).toBe(
      "antes \n![Subiendo imagen…](subiendo-t1)\ndespués",
    );
    expect(next.doc.lineAt(next.selection.main.head).text).toBe("después");
  });

  it("reuses an existing line break and stacks several images", () => {
    const state = stateOf("\nresto", 0);
    const next = apply(state, insertPlaceholders(state, ["a", "b"], { from: 0, to: 0 }));
    expect(next.doc.toString()).toBe(
      "![Subiendo imagen…](subiendo-a)\n![Subiendo imagen…](subiendo-b)\nresto",
    );
    expect(next.doc.lineAt(next.selection.main.head).number).toBe(3);
  });
});

describe("resolving a placeholder", () => {
  const pasted = (doc: string) => {
    const state = stateOf(doc, 0);
    return apply(state, insertPlaceholders(state, ["t1"], { from: 0, to: 0 }));
  };

  it("swaps the placeholder for the image, cursor still below it", () => {
    const next = resolve(pasted("texto"), "t1", URL_A);
    expect(next.doc.toString()).toBe(`![](${URL_A})\ntexto`);
    expect(next.doc.lineAt(next.selection.main.head).text).toBe("texto");
  });

  it("removes the placeholder's line when the upload failed", () => {
    expect(resolve(pasted("texto"), "t1", null).doc.toString()).toBe("texto");
  });

  it("does nothing once the placeholder is gone", () => {
    expect(removePlaceholder(stateOf("texto"), "t1")).toBeNull();
  });

  it("takes the image out with one undo, and never brings the placeholder back", () => {
    const once = undone(resolve(pasted("texto"), "t1", URL_A));
    expect(once.doc.toString()).toBe("texto");
    expect(undone(once).doc.toString()).toBe("texto");
  });

  it("puts the image back where it was when pasted mid-text", () => {
    const state = stateOf("antes después");
    const placed = apply(state, insertPlaceholders(state, ["t1"], { from: 6, to: 6 }));
    const next = resolve(placed, "t1", URL_A);
    expect(next.doc.toString()).toBe(`antes \n![](${URL_A})\ndespués`);
    expect(undone(next).doc.toString()).not.toContain("![](");
  });
});

describe("taskImageBlocks", () => {
  it("finds our images and anchors each at the end of its line", () => {
    const doc = `Antes\n![](${URL_A}) al lado\nDespués`;
    const blocks = taskImageBlocks(stateOf(doc), ORIGIN);
    expect(blocks).toEqual([
      { at: doc.indexOf(" al lado") + " al lado".length, url: URL_A, width: 800, height: 400 },
    ]);
  });

  it("leaves other origins and code blocks alone", () => {
    const doc = [
      "![](https://example.com/cms-tasks/x.webp)",
      "```",
      `![](${URL_A})`,
      "```",
      `\`![](${URL_A})\``,
    ].join("\n");
    expect(taskImageBlocks(stateOf(doc), ORIGIN)).toEqual([]);
  });
});

describe("rejectionFor", () => {
  it("accepts a screenshot under the limit", () => {
    expect(rejectionFor({ type: "image/png", size: 500_000 })).toBeNull();
  });

  it("rejects other types and oversized files", () => {
    expect(rejectionFor({ type: "image/svg+xml", size: 10 })).toMatch(/PNG/);
    expect(
      rejectionFor({ type: "image/png", size: MAX_TASK_IMAGE_BYTES + 1 }),
    ).toMatch(/2\.0 MB/);
  });
});
