import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock pdfjs-serverless so these stay fast, deterministic unit tests — no real
// PDF parsing. The mock also lets us simulate pdf.js's buffer-ownership behavior.
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-serverless", () => ({ getDocument }));

import { extractPdfDocument, extractPdfText } from "./pdf";

type Item = { str: string } | { type: string };

/** A fake PDFDocument whose pages yield the given text-content item arrays. */
function fakeDoc(pages: Item[][]) {
  return {
    numPages: pages.length,
    getPage: async (i: number) => ({
      getTextContent: async () => ({ items: pages[i - 1] }),
    }),
  };
}

/** A fake loading task, the shape `getDocument` returns. `destroy` lives here
 * and not on the document: current PDF.js hangs teardown off the task, and the
 * document proxy has no `destroy()` at all. */
function fakeTask(doc: ReturnType<typeof fakeDoc>) {
  return {
    promise: Promise.resolve(doc),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function resolveWith(pages: Item[][]) {
  getDocument.mockReturnValue(fakeTask(fakeDoc(pages)));
}

describe("extractPdfText", () => {
  beforeEach(() => {
    getDocument.mockReset();
  });

  it("joins items with spaces and pages with newlines", async () => {
    resolveWith([
      [{ str: "Liquidación" }, { str: "de" }, { str: "Servicios" }],
      [{ str: "Total" }, { str: "100" }],
    ]);
    expect(await extractPdfText(new Uint8Array([1]))).toBe(
      "Liquidación de Servicios\nTotal 100",
    );
  });

  it("preserves precomposed accents verbatim", async () => {
    // The whole reason for server-side extraction: clean NFC output.
    resolveWith([[{ str: "Público" }]]);
    const out = await extractPdfText(new Uint8Array([1]));
    expect(out).toBe("Público");
    expect(out.normalize("NFC")).toBe(out);
  });

  it("skips marked-content items that carry no glyphs", async () => {
    resolveWith([[{ str: "A" }, { type: "beginMarkedContent" }, { str: "B" }]]);
    expect(await extractPdfText(new Uint8Array([1]))).toBe("A B");
  });

  it("returns empty string for a PDF with no text", async () => {
    resolveWith([[]]);
    expect(await extractPdfText(new Uint8Array([1]))).toBe("");
  });

  it("does not detach the caller's buffer", async () => {
    // Regression: pdf.js takes ownership of the buffer it's handed and detaches
    // it. extractPdfText must pass a copy so the caller can still upload the same
    // bytes afterward. Here the mock detaches whatever buffer it receives; the
    // caller's original must survive.
    getDocument.mockImplementation(({ data }: { data: Uint8Array }) => {
      structuredClone(data.buffer, { transfer: [data.buffer] });
      return fakeTask(fakeDoc([[{ str: "x" }]]));
    });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    await extractPdfText(bytes);

    expect(bytes.byteLength).toBe(4);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("releases the document when done", async () => {
    const task = fakeTask(fakeDoc([[{ str: "x" }]]));
    getDocument.mockReturnValue(task);
    await extractPdfText(new Uint8Array([1]));
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it("releases the document even when a page throws", async () => {
    // The read happens in a serverless invocation: a malformed page that escapes
    // mid-loop must not leave the worker running behind it.
    const task = fakeTask({
      numPages: 1,
      getPage: async () => {
        throw new Error("broken page");
      },
    } as unknown as ReturnType<typeof fakeDoc>);
    getDocument.mockReturnValue(task);

    await expect(extractPdfText(new Uint8Array([1]))).rejects.toThrow(
      "broken page",
    );
    expect(task.destroy).toHaveBeenCalledOnce();
  });
});

describe("extractPdfDocument", () => {
  beforeEach(() => {
    getDocument.mockReset();
  });

  it("reports the page count and reads every page by default", async () => {
    resolveWith([[{ str: "a" }], [{ str: "b" }], [{ str: "c" }]]);
    expect(await extractPdfDocument(new Uint8Array([1]))).toEqual({
      text: "a\nb\nc",
      pageCount: 3,
      truncated: false,
    });
  });

  it("stops at maxPages and flags the read as truncated", async () => {
    // The public-drop guard: a document may declare far more pages than we're
    // willing to spend time on, and `pageCount` must still report the real total.
    resolveWith([[{ str: "a" }], [{ str: "b" }], [{ str: "c" }]]);
    expect(
      await extractPdfDocument(new Uint8Array([1]), { maxPages: 2 }),
    ).toEqual({ text: "a\nb", pageCount: 3, truncated: true });
  });

  it("does not flag truncation when maxPages exceeds the document", async () => {
    resolveWith([[{ str: "a" }]]);
    const out = await extractPdfDocument(new Uint8Array([1]), { maxPages: 30 });
    expect(out).toEqual({ text: "a", pageCount: 1, truncated: false });
  });

  it("never fetches a page beyond the cap", async () => {
    // Truncation has to happen before `getPage`, not after — the whole point is
    // to not do the work.
    const doc = fakeDoc([[{ str: "a" }], [{ str: "b" }], [{ str: "c" }]]);
    const getPage = vi.spyOn(doc, "getPage");
    getDocument.mockReturnValue(fakeTask(doc));
    await extractPdfDocument(new Uint8Array([1]), { maxPages: 1 });
    expect(getPage).toHaveBeenCalledTimes(1);
  });
});
