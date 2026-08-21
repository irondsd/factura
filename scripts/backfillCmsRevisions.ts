/**
 * One-shot: move every `cms_page`'s authored document into a
 * `cms_page_revision`, point the page at it, and re-key media usage by
 * revision (cms.md §14.10).
 *
 * Run it *between* the schema push and the deploy that reads revisions. The
 * order matters and there is no window where public content has no readable
 * source:
 *
 *   1. `truncate cms_media_usage` — that table is a cache of a pure function
 *      (see `src/cms/media/server/usage.ts`), it is about to be re-keyed from
 *      pages to revisions, and emptying it first is what lets the schema push
 *      add a NOT NULL column to it without a default. Nothing is lost: step 5
 *      re-derives every row.
 *   2. `bun run db:push` — adds `cms_page_revision`, the four pointers, the
 *      `cms_media_usage.revision_id` column, and drops the NOT NULLs from the
 *      legacy authored columns on `cms_page`. The running deploy still reads
 *      those columns and is unaffected.
 *   3. **this script** — backfills, verifies, and only then commits.
 *   4. deploy the code that reads revisions.
 *   5. rebuild media usage: «Recalcular» in /cms/media, or `bun run
 *      media:sweep`. Do it immediately, and trash nothing in between: until it
 *      runs the usage table is empty, so every image looks unused and the trash
 *      gate is open rather than closed. Trashing is reversible and `purgeAsset`
 *      re-checks before deleting bytes, so the window is survivable — but it is
 *      still a window.
 *   6. a later schema step drops the legacy authored columns from `cms_page`,
 *      once step 4 has been verified in production.
 *
 * The mapping is the one §14.10 specifies, and it is the only interesting
 * decision here:
 *
 *   - `published` page → one `published` revision, publication number 1,
 *     `published_at` = the page's own. It becomes the live publication.
 *   - `preview` page   → one `preview` revision, pointed at by
 *     `preview_revision_id`.
 *   - `draft` page     → one `wip` revision. A draft *is* work in progress;
 *     making it a publication would put a page nobody published into the
 *     history as one.
 *
 * No older publications are invented. A page that existed before this starts
 * with exactly one version, and the history says so rather than implying there
 * is something to restore.
 *
 * Dry run by default; `--apply` writes inside one transaction that rolls back
 * unless every page ends up with exactly one revision, the right pointer, and
 * the same rendered body it had before. `--backup <path>` dumps every page row
 * first — do that before applying to production.
 *
 * Idempotent: pages that already have a revision are skipped, so a second run
 * finds nothing and exits 0. Delete this file once every environment has been
 * through it.
 *
 *   bunx dotenv -e .env.prod -- bunx tsx scripts/backfillCmsRevisions.ts --backup /tmp/cms_page.json
 *   bunx dotenv -e .env.prod -- bunx tsx scripts/backfillCmsRevisions.ts --backup /tmp/cms_page.json --apply
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";

/** Which revision kind a page's current status becomes. */
const KIND_FOR_STATUS: Record<string, "published" | "preview" | "wip"> = {
  published: "published",
  preview: "preview",
  draft: "wip",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const backupIndex = process.argv.indexOf("--backup");
  const backupPath = backupIndex === -1 ? null : process.argv[backupIndex + 1];

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  // Only pages that have no revision yet. That is what makes a second run a
  // no-op rather than a duplicate: a page whose pointer is already set is
  // already migrated, whatever else is true of it.
  const pages = await sql`
    select p.* from cms_page p
    where p.published_revision_id is null
      and p.preview_revision_id is null
      and p.wip_revision_id is null
    order by p.section, p.slug
  `;

  console.log(`pages to migrate: ${pages.length}`);
  for (const page of pages) {
    console.log(
      `  ${page.section}/${page.slug} [${page.status}] → ${KIND_FOR_STATUS[page.status] ?? "?"}`,
    );
  }

  const unknown = pages.filter((page) => !KIND_FOR_STATUS[page.status]);
  if (unknown.length > 0) {
    throw new Error(
      `${unknown.length} page(s) have a status this script does not map: ${[
        ...new Set(unknown.map((page) => page.status)),
      ].join(", ")}`,
    );
  }

  if (pages.length === 0) {
    console.log("nothing to do");
    await sql.end();
    return;
  }

  if (backupPath) {
    writeFileSync(backupPath, JSON.stringify(pages, null, 2));
    console.log(`backup written: ${backupPath}`);
  }

  if (!apply) {
    console.log("\n-- dry run, nothing written. Re-run with --apply.");
    await sql.end();
    return;
  }

  const result = await sql.begin(async (tx) => {
    // Set-based, in SQL, with no round trip through JavaScript.
    //
    // Not an optimization — a correctness requirement. `timestamptz` keeps
    // microseconds and a JS `Date` keeps milliseconds, so reading a row into
    // Node and writing it back silently truncates `content_updated_at`: the
    // article's visible "actualizado el" would move by a fraction of a second
    // and, more to the point, the verification below could never prove the
    // copy is exact. Copying column to column inside the database cannot lose
    // anything.
    const inserted = await tx`
      with copied as (
        insert into cms_page_revision (
          page_id, kind, publication_number,
          body_mdx, title, title_tag, description, summary, cta,
          canonical_slug, metadata, parent_id, sort_order, crumb,
          content_updated_at, created_by, updated_by,
          created_at, updated_at, published_at
        )
        select
          p.id,
          case p.status
            when 'published' then 'published'
            when 'preview' then 'preview'
            else 'wip'
          end,
          case when p.status = 'published' then 1 end,
          p.body_mdx, p.title, p.title_tag, p.description, p.summary, p.cta,
          p.canonical_slug, p.metadata, p.parent_id, p.sort_order, p.crumb,
          p.content_updated_at, p.created_by, p.updated_by,
          p.created_at, p.updated_at,
          -- A publication needs a publication date, and a page published
          -- before this column existed may not have one. Its creation date is
          -- the only honest answer available, and it is never later than the
          -- publication it stands for.
          case when p.status = 'published'
            then coalesce(p.published_at, p.created_at) end
        from cms_page p
        where p.published_revision_id is null
          and p.preview_revision_id is null
          and p.wip_revision_id is null
        returning id, page_id, kind
      )
      update cms_page p set
        published_revision_id =
          case when copied.kind = 'published' then copied.id end,
        preview_revision_id =
          case when copied.kind = 'preview' then copied.id end,
        wip_revision_id =
          case when copied.kind = 'wip' then copied.id end
      from copied
      where copied.page_id = p.id
      returning p.id
    `;
    const migrated = inserted.length;

    // ── verification, inside the transaction ──────────────────────────────
    //
    // Every check that fails rolls the whole thing back. A partial migration is
    // the one outcome worth spending a round trip to make impossible: half the
    // pages reading from revisions and half from columns is a site where some
    // articles 404 and nobody can say which.
    const [{ n: unpointed }] = await tx`
      select count(*)::int as n from cms_page
      where published_revision_id is null
        and preview_revision_id is null
        and wip_revision_id is null
    `;
    if (unpointed !== 0) {
      throw new Error(`${unpointed} page(s) ended with no revision pointer`);
    }

    const [{ n: mismatched }] = await tx`
      select count(*)::int as n from cms_page p
      where (p.status = 'published' and p.published_revision_id is null)
         or (p.status = 'preview' and p.preview_revision_id is null)
    `;
    if (mismatched !== 0) {
      throw new Error(
        `${mismatched} page(s) are public but point at no public revision`,
      );
    }

    // The bodies, titles, metadata and dates the public was serving must come
    // back byte-for-byte through the new join. Compared here rather than by
    // eye after the fact.
    const drifted = await tx`
      select p.section, p.slug from cms_page p
      join cms_page_revision r on r.id = coalesce(
        p.published_revision_id, p.preview_revision_id, p.wip_revision_id)
      where p.body_mdx is distinct from r.body_mdx
         or p.title is distinct from r.title
         or p.title_tag is distinct from r.title_tag
         or p.description is distinct from r.description
         or p.summary is distinct from r.summary
         or p.cta is distinct from r.cta
         or p.canonical_slug is distinct from r.canonical_slug
         or p.metadata is distinct from r.metadata
         or p.parent_id is distinct from r.parent_id
         or p.sort_order is distinct from r.sort_order
         or p.crumb is distinct from r.crumb
         or p.content_updated_at is distinct from r.content_updated_at
    `;
    if (drifted.length > 0) {
      throw new Error(
        `${drifted.length} page(s) do not match their revision: ${drifted
          .map((row) => `${row.section}/${row.slug}`)
          .join(", ")}`,
      );
    }

    return { migrated };
  });

  console.log(`applied: ${result.migrated} page(s) migrated`);
  console.log(
    "verified: every page points at a revision whose document matches the row it came from",
  );
  console.log(
    "next: deploy, then rebuild media usage («Recalcular» in /cms/media, or `bun run media:sweep`)",
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
