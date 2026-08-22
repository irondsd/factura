-- Drop the legacy authored columns from `cms_page` (cms.md §14.10, step 6).
--
-- Run this only after the revision-reading deploy has been live and verified.
-- Until then these columns are the backfill's rollback path: they still hold
-- every page's document exactly as it was before the migration, and nothing
-- has written them since.
--
-- Irreversible in practice. Back up first; `scripts/backfillCmsRevisions.ts`
-- cannot be re-run once these are gone.
--
-- **Remove the declarations from `src/db/schema.ts` and deploy that first.**
-- Drizzle builds a query's column list from the schema, so a column this file
-- has dropped while the schema still declares it turns every unprojected read
-- of `cms_page` into an error. Code first, then this.
--
-- The check below is not decoration. It refuses to drop anything while a page
-- exists that no revision covers — the one state in which these columns are
-- still the only copy of somebody's article.

begin;

do $$
declare unpointed integer;
begin
  select count(*) into unpointed from cms_page
  where published_revision_id is null
    and preview_revision_id is null
    and wip_revision_id is null;
  if unpointed > 0 then
    raise exception '% page(s) have no revision — refusing to drop the legacy columns', unpointed;
  end if;
end $$;

alter table cms_page
  drop column if exists body_mdx,
  drop column if exists title,
  drop column if exists title_tag,
  drop column if exists description,
  drop column if exists summary,
  drop column if exists cta,
  drop column if exists canonical_slug,
  drop column if exists metadata,
  drop column if exists sort_order,
  drop column if exists crumb,
  drop column if exists content_updated_at;

-- `parent_id` goes last and separately, because it is the one whose removal
-- also drops an index and a self-referencing foreign key. The live tree lives
-- on `cms_page_revision.parent_id` now.
drop index if exists cms_page_parent_idx;
alter table cms_page drop column if exists parent_id;

commit;
