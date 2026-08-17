#!/usr/bin/env bun
/**
 * Validates every published content section — `/guias`, `/estadisticas` and
 * `/investigacion` — in one run. The form CI uses.
 *
 * Run: `bun scripts/validate-content.ts`  (or `npm run validate:content`)
 * Exit code is 1 if any ERROR is found (warnings don't fail the run).
 *
 * Not just a shell script running the others: the title/description collision
 * check is cross-file by nature, and two pages competing for one search result
 * are most likely to be a guide and a data page about the same subject — which
 * neither section's own run can see. `finish` runs that pass over everything at
 * once, so this is the only invocation that catches it.
 */
import { collectGuides } from "./validate-guides";
import { collectSections } from "./validate-sections";
import { finish } from "./lib/content";

finish([{ name: "Guías", reports: collectGuides() }, ...collectSections()]);
