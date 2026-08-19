#!/usr/bin/env bun
/** Validates the committed export of the published CMS corpus. */
import snapshot from "../src/content-system/content-snapshot.json";
import { parseSnapshot } from "../src/content-system/snapshot";
import { validateContentCollection } from "../src/content-system/validation";

const documents = parseSnapshot(JSON.stringify(snapshot));
const diagnostics = validateContentCollection(documents);
let errors = 0;
let warnings = 0;

for (const document of documents) {
  const findings =
    diagnostics.get(`${document.section}/${document.slug}`) ?? [];
  for (const finding of findings) {
    const location =
      finding.line === undefined
        ? ""
        : `:${finding.line}${finding.column === undefined ? "" : `:${finding.column}`}`;
    console.log(
      `${finding.severity} ${document.section}/${document.slug}${location} ${finding.message}`,
    );
    if (finding.severity === "error") errors++;
    else warnings++;
  }
}

console.log(
  `${documents.length} documents · ${errors} errors · ${warnings} warnings`,
);
process.exitCode = errors === 0 ? 0 : 1;
