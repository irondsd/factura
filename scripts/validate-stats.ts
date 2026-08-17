#!/usr/bin/env bun
/**
 * `/estadisticas` alone. The checks live in `validate-sections.ts`, which is
 * shared with `/investigacion` — this is the entrypoint that reports on one
 * section, for when that is the one being worked on.
 *
 * Every section is still *parsed*, because a link from a statistics page into a
 * research page has to resolve; only the reports are narrowed.
 *
 * Run: `bun scripts/validate-stats.ts`  (or `npm run validate:stats`)
 */
import { finish, isEntrypoint } from "./lib/content";
import { collectSections } from "./validate-sections";

if (isEntrypoint(import.meta.url)) {
  finish(collectSections(["estadisticas"]));
}
