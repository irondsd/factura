import { describe, expect, it } from "vitest";
import {
  bodyHunks,
  type ComparableDocument,
  diffDocuments,
  diffLines,
  documentsEqual,
  stableJson,
} from "./diff";

// Comparing two versions of a page (cms.md).
//
// `documentsEqual` carries more weight than a diff usually would: it is what
// stops a publication that changes nothing from consuming a retention slot and
// pushing the oldest publication out. So the interesting cases here are the
// ones where two documents *look* different and are not — key order in the
// metadata blob, `null` against `""` — and the one where they look the same and
// are not: a reordered array.

const base: ComparableDocument = {
  body: "Uno.\nDos.\nTres.\n",
  title: "Una guía",
  titleTag: null,
  description: "Descripción.",
  summary: "Resumen.",
  cta: "Probá Factura.",
  canonicalSlug: null,
  parentId: null,
  sortOrder: 0,
  crumb: null,
  metadata: { keywords: ["luz", "gas"], categories: ["servicios"] },
};

describe("documentsEqual", () => {
  it("is true for an unchanged document", () => {
    expect(documentsEqual(base, { ...base })).toBe(true);
  });

  it("ignores metadata key order", () => {
    // Zod's parse and a hand-written blob can differ only in key order, and a
    // publication refused as "changed" for that would be a duplicate nobody
    // asked for.
    expect(
      documentsEqual(base, {
        ...base,
        metadata: { categories: ["servicios"], keywords: ["luz", "gas"] },
      }),
    ).toBe(true);
  });

  it("treats an empty string and null as the same absent value", () => {
    // The form sends `""` for a cleared optional field and the database holds
    // `null`. They mean the same thing to a reader, so they must compare equal.
    expect(
      documentsEqual(
        { ...base, titleTag: null },
        { ...base, titleTag: "" as unknown as null },
      ),
    ).toBe(true);
  });

  it("is false for a reordered array", () => {
    // Order is authored: the keywords appear in the metadata in the order they
    // were written, and swapping them is an edit.
    expect(
      documentsEqual(base, {
        ...base,
        metadata: { keywords: ["gas", "luz"], categories: ["servicios"] },
      }),
    ).toBe(false);
  });

  it("is false for a changed body, and for a changed scalar", () => {
    expect(documentsEqual(base, { ...base, body: "Uno.\n" })).toBe(false);
    expect(documentsEqual(base, { ...base, sortOrder: 1 })).toBe(false);
  });
});

describe("diffDocuments", () => {
  it("reports an unchanged document as identical, with nothing listed", () => {
    const diff = diffDocuments(base, { ...base });
    expect(diff.identical).toBe(true);
    expect(diff.fields).toEqual([]);
    expect(diff.bodyAdded).toBe(0);
    expect(diff.bodyRemoved).toBe(0);
  });

  it("names a changed scalar field in the words the form uses", () => {
    const diff = diffDocuments(base, { ...base, title: "Otra guía" });
    expect(diff.fields).toMatchObject([
      {
        field: "title",
        label: "Título",
        kind: "changed",
        base: "Una guía",
        candidate: "Otra guía",
      },
    ]);
  });

  it("tells a field being set apart from one being cleared", () => {
    expect(
      diffDocuments(base, { ...base, titleTag: "Título corto" }).fields[0],
    ).toMatchObject({ kind: "added", base: null });
    expect(
      diffDocuments({ ...base, titleTag: "Título corto" }, base).fields[0],
    ).toMatchObject({ kind: "removed", candidate: null });
  });

  it("compares metadata one top-level key at a time", () => {
    const diff = diffDocuments(base, {
      ...base,
      metadata: { keywords: ["luz", "gas", "agua"], categories: ["servicios"] },
    });
    expect(diff.fields).toMatchObject([
      {
        field: "metadata.keywords",
        label: "Palabras clave",
        base: "luz, gas",
        candidate: "luz, gas, agua",
      },
    ]);
  });

  it("counts body lines added and removed", () => {
    const diff = diffDocuments(base, {
      ...base,
      body: "Uno.\nDos y medio.\nTres.\n",
    });
    expect(diff.bodyAdded).toBe(1);
    expect(diff.bodyRemoved).toBe(1);
    expect(diff.identical).toBe(false);
  });
});

describe("diffLines", () => {
  it("keeps unchanged lines and numbers both sides", () => {
    const lines = diffLines("a\nb\nc", "a\nB\nc");
    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      ["same", "a"],
      ["removed", "b"],
      ["added", "B"],
      ["same", "c"],
    ]);
    expect(lines[0]).toMatchObject({ baseLine: 1, candidateLine: 1 });
    expect(lines[1]).toMatchObject({ baseLine: 2, candidateLine: null });
    expect(lines[2]).toMatchObject({ baseLine: null, candidateLine: 2 });
  });

  it("handles a pure insertion without rewriting the surrounding lines", () => {
    // The property a naive line-by-line comparison gets wrong: inserting one
    // paragraph must not report every line after it as changed.
    const lines = diffLines("a\nb", "a\nnuevo\nb");
    expect(lines.filter((line) => line.kind !== "same")).toMatchObject([
      { kind: "added", text: "nuevo" },
    ]);
  });

  it("handles an empty side", () => {
    expect(diffLines("", "a").map((line) => line.kind)).toEqual([
      "removed",
      "added",
    ]);
  });
});

describe("bodyHunks", () => {
  it("returns nothing when nothing changed", () => {
    expect(bodyHunks(diffLines("a\nb\nc", "a\nb\nc"))).toEqual([]);
  });

  it("keeps context around a change and says how much it skipped", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10");
    const hunks = bodyHunks(diffLines(before, after), 2);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].skipped).toBe(8);
    // Two lines of context, the removal, the addition, two more of context.
    expect(hunks[0].lines.map((line) => line.text)).toEqual([
      "l8",
      "l9",
      "l10",
      "L10",
      "l11",
      "l12",
    ]);
  });

  it("merges changes that are closer together than the context window", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10").replace("l12", "L12");
    expect(bodyHunks(diffLines(before, after), 3)).toHaveLength(1);
  });
});

describe("stableJson", () => {
  it("sorts object keys at every depth but leaves arrays alone", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
    expect(stableJson([2, 1])).toBe("[2,1]");
  });
});
