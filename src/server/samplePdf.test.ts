import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_PATH,
  renderSamplePdf,
  SAMPLE_PATH,
} from "../../scripts/makeSamplePdf";
import { ENGINE_CONFIGS } from "@/parsers/engine/configs";
import { runConfig, selectConfig } from "@/parsers/engine/evaluate";
import { normalize } from "@/parsers/normalize";
import { extractPdfText } from "./pdf";
import { toSamplePdfText, wrapTokens } from "./samplePdf";

// Deliberately uses the REAL pdfjs-serverless. pdf.test.ts mocks it, but vi.mock
// is file-scoped, so there's no interference — and mocking here would defeat the
// entire point, which is to prove the bytes we ship actually extract.

const fixture = readFileSync(FIXTURE_PATH, "utf8");
const committed = new Uint8Array(readFileSync(SAMPLE_PATH));

/** The 58-digit payment barcode. If a line break ever lands inside this, the
 * barcode capture stops firing and the parser quietly falls back to its
 * label-based rules — a degradation no other assertion here would catch. */
const BARCODE = fixture.match(/\b\d{58}\b/)?.[0];

describe("toSamplePdfText", () => {
  it("leaves nothing outside Latin-1", () => {
    // The whole reason a WinAnsi encoding table isn't needed: after folding,
    // encoding is a plain byte cast.
    const out = toSamplePdfText(fixture);
    const offenders = [...new Set(out)].filter(
      (ch) => ch.codePointAt(0)! > 0xff,
    );
    expect(offenders).toEqual([]);
  });

  it("only removes barcode glyph runs and smart punctuation", () => {
    // Asserted rather than assumed: `normalize` already discards the glyph runs
    // before any parser sees them, so dropping them here has to be lossless.
    const dropped = [...new Set(fixture)].filter(
      (ch) => ch.codePointAt(0)! > 0xff,
    );
    const soup = dropped.filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp >= 0x0100 && cp <= 0x04ff;
    });
    expect(new Set([...soup, "“", "”"])).toEqual(new Set(dropped));
  });

  it("keeps the barcode intact", () => {
    expect(BARCODE).toBeDefined();
    expect(toSamplePdfText(fixture)).toContain(BARCODE!);
  });
});

describe("wrapTokens", () => {
  it("never splits a token, even one longer than the line", () => {
    const lines = wrapTokens("short 1234567890123456789012345 end", 10);
    expect(lines).toEqual(["short", "1234567890123456789012345", "end"]);
  });

  it("packs tokens up to the limit", () => {
    expect(wrapTokens("aa bb cc dd", 5)).toEqual(["aa bb", "cc dd"]);
  });

  it("returns nothing for empty input", () => {
    expect(wrapTokens("", 10)).toEqual([]);
  });
});

describe("the committed sample PDF", () => {
  it("matches what the generator produces", () => {
    // The writer emits no timestamps, so this is deterministic. Catches both
    // "regenerated but forgot to commit" and "edited the writer/fixture without
    // regenerating".
    expect(Buffer.from(renderSamplePdf())).toEqual(Buffer.from(committed));
  });

  it("is recognized by the Edesur parser, not merely by something", async () => {
    const text = normalize(await extractPdfText(committed));
    const config = selectConfig(ENGINE_CONFIGS, text);
    expect(config?.slug).toBe("edesur");
  });

  it("extracts exactly what the source fixture extracts", async () => {
    // Tracks the parser instead of freezing a snapshot: edit edesur.ts and both
    // sides of this move together.
    const fromPdf = normalize(await extractPdfText(committed));
    const fromFixture = normalize(fixture);
    const config = selectConfig(ENGINE_CONFIGS, fromFixture)!;
    expect(runConfig(config, fromPdf)).toEqual(runConfig(config, fromFixture));
  });

  it("extracts the expected values", async () => {
    // Pinned, so a silently degraded fixture can't satisfy the test above by
    // degrading both sides equally.
    const text = normalize(await extractPdfText(committed));
    const config = selectConfig(ENGINE_CONFIGS, text)!;
    const result = runConfig(config, text);
    expect(result.identity).toBe("1234567");
    expect(result.amount).toBe(22590.52);
    expect(result.period).toBe("2026-05-01");
    expect(result.dueDate).toBe("2026-06-01");
    expect(result.custom.consumption).toEqual({ value: 120, unit: "kWh" });
  });

  it("keeps the barcode as one unbroken token after extraction", async () => {
    // The regression guard for wrapTokens' no-split rule. Without it, the two
    // tests above still pass via the parser's label fallbacks while the barcode
    // path is dead.
    const text = normalize(await extractPdfText(committed));
    expect(text).toContain(BARCODE!);
  });
});
