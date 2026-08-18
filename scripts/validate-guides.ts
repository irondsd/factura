#!/usr/bin/env bun
/**
 * Validates the guide MDX files in `src/content/guias` against the authoring
 * format (see `src/content/guias/AUTHORING.md`).
 *
 * Run: `bun scripts/validate-guides.ts`  (or `npm run validate:guides`)
 * Exit code is 1 if any ERROR is found (warnings don't fail the run).
 *
 * `npm run validate:content` runs this and the section validators together,
 * which is the form CI uses — the cross-file title/description check only sees
 * a guide cannibalizing a statistics page when both sections are in the room.
 *
 * Since Phase 4 of the CMS work this script is a *thin adapter*: the rules
 * themselves are pure functions in `src/content-system/validation`, shared with
 * the CMS editor, the publish gate and the CMS MCP. There is one definition of
 * a valid guide, and this file's job is to read the filesystem and print.
 *
 * The rules are unchanged from the previous implementation with one deliberate
 * exception: an unrecognized `meta` key is now an ERROR rather than a warning,
 * because database metadata is a validated JSONB column and a key nothing reads
 * must not be silently dropped by the importer.
 */
import {
  assetExists,
  documentsFromFilesystem,
} from "../src/content-system/adapters/filesystem";
import { validateContentCollection } from "../src/content-system/validation";
import { finish, isEntrypoint, newReport, type Report } from "./lib/content";

/** Every guide's report. The shared title/description collision pass runs
 * inside `validateContentCollection`; `finish` still runs its own across every
 * section at once, which is what catches a guide colliding with a statistics
 * page. */
export function collectGuides(): Report[] {
  let documents: ReturnType<typeof documentsFromFilesystem>;
  try {
    documents = documentsFromFilesystem("guias");
  } catch (e) {
    return [
      {
        ...newReport("guias/"),
        errors: [`cannot read guides: ${(e as Error).message}`],
      },
    ];
  }

  if (documents.length === 0) {
    return [{ ...newReport("guias/"), errors: ["no .mdx guides found"] }];
  }

  const findings = validateContentCollection(documents, { assetExists });

  return documents.map((document) => {
    const diagnostics = findings.get(`guias/${document.slug}`) ?? [];
    return {
      ...newReport(`guias/${document.slug}.mdx`),
      errors: diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.message),
      warnings: diagnostics
        .filter((d) => d.severity === "warning")
        .map((d) => d.message),
      // Fed to `finish`'s cross-section collision pass. The rendered <title> is
      // what competes in a search result, so a guide with a `titleTag` is
      // compared on that rather than on its headline.
      title: document.titleTag ?? document.title,
      description: document.description,
    };
  });
}

if (isEntrypoint(import.meta.url)) {
  finish([{ name: "Guías", reports: collectGuides() }]);
}
