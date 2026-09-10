import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  blockFormatTransaction,
  clearFormattingTransaction,
  dividerTransaction,
  footnoteTransaction,
  inlineFormatTransaction,
  listFormatTransaction,
  tableTransaction,
} from "./markdownFormatting";

function changed(
  doc: string,
  selection: number | readonly [number, number],
  build: (state: EditorState) => TransactionSpec,
) {
  const range =
    typeof selection === "number"
      ? EditorSelection.cursor(selection)
      : EditorSelection.range(selection[0], selection[1]);
  const state = EditorState.create({ doc, selection: range });
  const next = state.update(build(state)).state;
  return {
    doc: next.doc.toString(),
    selected: next.sliceDoc(next.selection.main.from, next.selection.main.to),
    cursor: next.selection.main.head,
  };
}

describe("inline Markdown formatting", () => {
  it("wraps a selection and keeps its words selected", () => {
    expect(
      changed("Una palabra.", [4, 11], (state) =>
        inlineFormatTransaction(state, "bold"),
      ),
    ).toMatchObject({ doc: "Una **palabra**.", selected: "palabra" });
  });

  it("removes an existing wrapper around a selection", () => {
    expect(
      changed("Una **palabra**.", [6, 13], (state) =>
        inlineFormatTransaction(state, "bold"),
      ),
    ).toMatchObject({ doc: "Una palabra.", selected: "palabra" });
  });

  it("inserts and selects a placeholder when there is no selection", () => {
    expect(
      changed("Texto ", 6, (state) => inlineFormatTransaction(state, "italic")),
    ).toMatchObject({ doc: "Texto *texto*", selected: "texto" });
  });

  it("keeps selected link copy and selects the destination", () => {
    expect(
      changed("Ver la guía", [4, 11], (state) =>
        inlineFormatTransaction(state, "link"),
      ),
    ).toMatchObject({
      doc: "Ver [la guía](https://)",
      selected: "https://",
    });
  });
});

describe("block Markdown formatting", () => {
  it("changes a heading level instead of stacking markers", () => {
    expect(
      changed("## Título", 5, (state) =>
        blockFormatTransaction(state, "heading-3"),
      ).doc,
    ).toBe("### Título");
  });

  it("turns a quote back into a paragraph", () => {
    expect(
      changed("> Una cita", 5, (state) =>
        blockFormatTransaction(state, "paragraph"),
      ).doc,
    ).toBe("Una cita");
  });

  it("toggles a selected group of quotes", () => {
    const quoted = changed("Uno\nDos", [0, 7], (state) =>
      blockFormatTransaction(state, "quote"),
    );
    expect(quoted.doc).toBe("> Uno\n> Dos");
    expect(
      changed(quoted.doc, [0, quoted.doc.length], (state) =>
        blockFormatTransaction(state, "quote"),
      ).doc,
    ).toBe("Uno\nDos");
  });

  it("converts list kinds and toggles the current kind off", () => {
    expect(
      changed("- Uno\n- Dos", [0, 11], (state) =>
        listFormatTransaction(state, "numbered-list"),
      ).doc,
    ).toBe("1. Uno\n2. Dos");
    expect(
      changed("1. Uno\n2. Dos", [0, 13], (state) =>
        listFormatTransaction(state, "numbered-list"),
      ).doc,
    ).toBe("Uno\nDos");
  });

  it("wraps a selected block in a fenced code block", () => {
    expect(
      changed("uno\ndos", [0, 7], (state) =>
        blockFormatTransaction(state, "code-block"),
      ),
    ).toMatchObject({
      doc: "```text\nuno\ndos\n```",
      selected: "uno\ndos",
    });
  });

  it("turns a fenced block back into paragraphs from its cursor", () => {
    expect(
      changed("```text\nuno\ndos\n```", 11, (state) =>
        blockFormatTransaction(state, "paragraph"),
      ).doc,
    ).toBe("uno\ndos");
  });
});

describe("clear Markdown formatting", () => {
  it("removes mixed formatting while keeping readable text", () => {
    const doc = "**Negrita**, *cursiva*, [enlace](/guia) y `código`.";
    expect(
      changed(doc, [0, doc.length], clearFormattingTransaction),
    ).toMatchObject({
      doc: "Negrita, cursiva, enlace y código.",
      selected: "Negrita, cursiva, enlace y código.",
    });
  });

  it("removes markers surrounding the selected words", () => {
    expect(
      changed(
        "Antes ***muy importante*** después",
        [9, 23],
        clearFormattingTransaction,
      ),
    ).toMatchObject({
      doc: "Antes muy importante después",
      selected: "muy importante",
    });
  });

  it("unwraps a link when only its label is selected", () => {
    expect(
      changed(
        "Lee [esta guía](/guias/una)",
        [5, 14],
        clearFormattingTransaction,
      ),
    ).toMatchObject({ doc: "Lee esta guía", selected: "esta guía" });
  });

  it("strips selected block prefixes but preserves images and components", () => {
    const doc =
      "> ## Título\n- **Dato**\n\n![Gráfico](/media/grafico.webp)\n<BillExample />";
    expect(changed(doc, [0, doc.length], clearFormattingTransaction).doc).toBe(
      "Título\nDato\n\n![Gráfico](/media/grafico.webp)\n<BillExample />",
    );
  });

  it("returns the current list item to a paragraph without a selection", () => {
    expect(
      changed("Antes\n2. Elemento\nDespués", 12, clearFormattingTransaction)
        .doc,
    ).toBe("Antes\nElemento\nDespués");
  });

  it("returns the current fenced block to paragraphs without a selection", () => {
    expect(
      changed("```text\nuno\ndos\n```", 11, clearFormattingTransaction).doc,
    ).toBe("uno\ndos");
  });
});

describe("insertions", () => {
  it("inserts a GFM table between paragraphs and selects its first header", () => {
    expect(changed("Antes.Después", 6, tableTransaction)).toMatchObject({
      doc: "Antes.\n\n| Columna | Columna |\n| --- | --- |\n| Dato | Dato |\n\nDespués",
      selected: "Columna",
    });
  });

  it("adds a divider with safe blank lines", () => {
    expect(changed("Antes.\nDespués", 6, dividerTransaction).doc).toBe(
      "Antes.\n\n---\n\nDespués",
    );
  });

  it("uses the next footnote number and selects its definition", () => {
    expect(changed("Uno[^1]. Dos.", 13, footnoteTransaction)).toMatchObject({
      doc: "Uno[^1]. Dos.[^2]\n\n[^2]: Fuente o aclaración.\n",
      selected: "Fuente o aclaración.",
    });
  });
});
