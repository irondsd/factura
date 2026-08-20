/**
 * One-shot: rename the research section id from the retired singular
 * `investigacion` to `investigaciones`.
 *
 * The code no longer knows the singular at all, so this has to run against any
 * database that still holds it — otherwise `/investigaciones` lists nothing and
 * the research pages 404. It touches two things:
 *
 *   - `cms_page.section`  'investigacion' → 'investigaciones'
 *   - `metadata->>'previewImage'`  /img/investigacion/… → /img/investigaciones/…
 *     (the files moved with the section, see `public/img/investigaciones/`)
 *
 * Dry run by default; `--apply` writes, inside one transaction that rolls back
 * if any singular value survives it. `--backup <path>` dumps every row it would
 * touch first — do that before applying to production.
 *
 * Idempotent: a second run finds nothing and exits 0. Delete this file once
 * every environment has been through it.
 *
 *   bunx dotenv -e .env.prod -- bunx tsx scripts/renameInvestigacionSection.ts --backup /tmp/cms_page.json
 *   bunx dotenv -e .env.prod -- bunx tsx scripts/renameInvestigacionSection.ts --backup /tmp/cms_page.json --apply
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";

async function main() {
  const apply = process.argv.includes("--apply");
  const backupIndex = process.argv.indexOf("--backup");
  const backupPath = backupIndex === -1 ? null : process.argv[backupIndex + 1];

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  const affected = await sql`
    select * from cms_page
    where section = 'investigacion'
       or metadata->>'previewImage' like '/img/investigacion/%'
    order by slug
  `;

  console.log(`rows affected: ${affected.length}`);
  for (const row of affected) {
    const preview =
      (row.metadata as Record<string, unknown>)?.previewImage ?? "—";
    console.log(`  ${row.section}/${row.slug} [${row.status}] ${preview}`);
  }

  if (affected.length === 0) {
    console.log("nothing to do");
    await sql.end();
    return;
  }

  if (backupPath) {
    writeFileSync(backupPath, JSON.stringify(affected, null, 2));
    console.log(`backup written: ${backupPath}`);
  }

  if (!apply) {
    console.log("\n-- dry run, nothing written. Re-run with --apply.");
    await sql.end();
    return;
  }

  const result = await sql.begin(async (tx) => {
    const sections = await tx`
      update cms_page set section = 'investigaciones'
      where section = 'investigacion'
      returning slug
    `;
    const previews = await tx`
      update cms_page
      set metadata = jsonb_set(
        metadata,
        '{previewImage}',
        to_jsonb(replace(metadata->>'previewImage',
                         '/img/investigacion/', '/img/investigaciones/'))
      )
      where metadata->>'previewImage' like '/img/investigacion/%'
      returning slug
    `;
    const [{ n }] = await tx`
      select count(*)::int as n from cms_page
      where section = 'investigacion'
         or metadata->>'previewImage' like '/img/investigacion/%'
    `;
    if (n !== 0) {
      throw new Error(`${n} singular row(s) survived the update — rolled back`);
    }
    return { sections: sections.length, previews: previews.length };
  });

  console.log(
    `applied: section=${result.sections} row(s), previewImage=${result.previews} row(s)`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
