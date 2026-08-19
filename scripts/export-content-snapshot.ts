#!/usr/bin/env bun
/** Exports the CMS corpus for database-free CI validation. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { asc, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { cmsPages } from "../src/db/schema";
import { rowToDocument } from "../src/content-system/repository/mapping";
import { serializeSnapshot } from "../src/content-system/snapshot";
import { CONTENT_SECTIONS } from "../src/content-system/types";

const documents = (
  await db.query.cmsPages.findMany({
    where: inArray(cmsPages.section, CONTENT_SECTIONS),
    orderBy: [asc(cmsPages.section), asc(cmsPages.slug)],
  })
).map(rowToDocument);

if (documents.length === 0) {
  throw new Error("refusing to write an empty CMS content snapshot");
}

const output = path.join(
  process.cwd(),
  "src/content-system/content-snapshot.json",
);
writeFileSync(output, serializeSnapshot(documents));
console.log(`Wrote ${documents.length} CMS documents to ${output}`);
