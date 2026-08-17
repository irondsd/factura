#!/usr/bin/env bun
/**
 * `/investigacion` alone. The checks live in `validate-sections.ts`, which is
 * shared with `/estadisticas` — this is the entrypoint that reports on one
 * section, for when that is the one being worked on.
 *
 * Every section is still *parsed*, because a research page's whole job is to
 * link back into the series it joined; only the reports are narrowed.
 *
 * Run: `bun scripts/validate-investigacion.ts`  (or `npm run validate:investigacion`)
 */
import { finish, isEntrypoint } from "./lib/content";
import { collectSections } from "./validate-sections";

if (isEntrypoint(import.meta.url)) {
  finish(collectSections(["investigacion"]));
}
