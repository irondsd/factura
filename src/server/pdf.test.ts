import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock pdfjs-serverless so these stay fast, deterministic unit tests — no real
// PDF parsing. The mock also lets us simulate pdf.js's buffer-ownership behavior.
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-serverless", () => ({ getDocument }));

import { extractPdfText } from "./pdf";

type Item = { str: string } | { type: string };

/** A fake PDFDocument whose pages yield the given text-content item arrays. */
function fakeDoc(pages: Item[][]) {
  return {
    numPages: pages.length,
    getPage: async (i: number) => ({
      getTextContent: async () => ({ items: pages[i - 1] }),
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

function resolveWith(pages: Item[][]) {
  getDocument.mockReturnValue({ promise: Promise.resolve(fakeDoc(pages)) });
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
      return { promise: Promise.resolve(fakeDoc([[{ str: "x" }]])) };
    });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    await extractPdfText(bytes);

    expect(bytes.byteLength).toBe(4);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("releases the document when done", async () => {
    const doc = fakeDoc([[{ str: "x" }]]);
    getDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    await extractPdfText(new Uint8Array([1]));
    expect(doc.destroy).toHaveBeenCalledOnce();
  });
});
