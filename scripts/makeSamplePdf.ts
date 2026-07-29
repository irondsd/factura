/**
 * Generate the sample bill offered on /probar ("no bill handy? try a sample").
 *
 * Source is the Edesur test fixture, which is already sanitized — "JUAN PEREZ
 * EJEMPLO", "CALLE FALSA 1234", client 01234567 — so the published PDF carries
 * no real customer's data.
 *
 * The output is committed. Run this only when the fixture or the writer changes,
 * and commit the result: samplePdf.test.ts asserts that regenerating produces
 * the exact bytes on disk, so a stale artifact fails the build.
 *
 * Usage:
 *   npm run sample:pdf
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSamplePdf, toSamplePdfText } from "../src/server/samplePdf";

export const FIXTURE_PATH = path.join(
  process.cwd(),
  "src/parsers/__fixtures__/edesur.txt",
);
export const SAMPLE_PATH = path.join(
  process.cwd(),
  "public/samples/edesur-ejemplo.pdf",
);

export function renderSamplePdf(): Uint8Array {
  return buildSamplePdf(toSamplePdfText(readFileSync(FIXTURE_PATH, "utf8")));
}

function main() {
  const bytes = renderSamplePdf();
  mkdirSync(path.dirname(SAMPLE_PATH), { recursive: true });
  writeFileSync(SAMPLE_PATH, bytes);
  console.log(
    `Wrote ${path.relative(process.cwd(), SAMPLE_PATH)} (${bytes.length} bytes)`,
  );
}

// Only when run as a script. samplePdf.test.ts imports the helpers above to
// prove the committed artifact matches what this generator produces, and must
// not rewrite the file as a side effect of that check.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
