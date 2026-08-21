-- CMS working copies, revisions and version history (cms.md §14.10).
--
-- The DDL half of the migration. Additive and reversible on its own: it adds a
-- table, four nullable pointers, and relaxes constraints. Nothing here changes
-- what any running deploy reads, so it is safe to apply while the current
-- version is serving traffic.
--
-- Order of the whole migration:
--
--   1. `truncate cms_media_usage`  (a derived cache; step 5 rebuilds it)
--   2. this file
--   3. `scripts/backfillCmsRevisions.ts --apply`
--   4. deploy
--   5. rebuild media usage immediately: «Recalcular» in /cms/media, or
--      `bun run media:sweep`. Trash nothing before it runs — the usage table is
--      empty until then, so every image looks unused.
--   6. later: `cms-revisions-drop-legacy.sql`, once step 4 is verified
--
-- Applied by hand rather than by `drizzle-kit push` because push cannot tell
-- `cms_media_usage.page_id → revision_id` from "drop one column, add another"
-- without an interactive answer, and because production DDL goes through the
-- direct Neon endpoint (cms.md §11). Run `bun run db:push` afterwards to
-- confirm it reports no remaining drift.

begin;

-- ── the revision table ─────────────────────────────────────────────────────

create table if not exists cms_page_revision (
  id                     uuid primary key default gen_random_uuid(),
  page_id                uuid not null references cms_page(id) on delete cascade,
  kind                   text not null,
  based_on_revision_id   uuid references cms_page_revision(id) on delete set null,
  publication_number     integer,

  body_mdx               text not null,
  title                  text not null,
  title_tag              text,
  description            text not null,
  summary                text not null,
  cta                    text not null,
  canonical_slug         text,
  metadata               jsonb not null,
  parent_id              uuid references cms_page(id) on delete restrict,
  sort_order             integer not null default 0,
  crumb                  text,
  content_updated_at     timestamptz not null default now(),

  created_by             uuid references users(id) on delete set null,
  updated_by             uuid references users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  published_at           timestamptz,

  constraint cms_page_revision_kind_ck
    check (kind in ('wip', 'checkpoint', 'preview', 'published')),
  -- A publication number and a publication date belong to a publication and to
  -- nothing else. Without this a `wip` carrying a number would be counted by
  -- the retention sweep.
  constraint cms_page_revision_publication_number_ck
    check ((kind = 'published') = (publication_number is not null)),
  constraint cms_page_revision_published_at_ck
    check ((kind = 'published') = (published_at is not null))
);

-- At most one of each singleton kind per page. Partial unique indexes rather
-- than service-side checks: "one working copy per page" is the invariant two
-- concurrent saves race on, and only the database can settle that race.
create unique index if not exists cms_page_revision_wip_idx
  on cms_page_revision (page_id) where kind = 'wip';
create unique index if not exists cms_page_revision_checkpoint_idx
  on cms_page_revision (page_id) where kind = 'checkpoint';
create unique index if not exists cms_page_revision_preview_idx
  on cms_page_revision (page_id) where kind = 'preview';
create unique index if not exists cms_page_revision_publication_idx
  on cms_page_revision (page_id, publication_number)
  where publication_number is not null;

create index if not exists cms_page_revision_page_kind_idx
  on cms_page_revision (page_id, kind, published_at);
create index if not exists cms_page_revision_parent_idx
  on cms_page_revision (parent_id);

-- ── the page's four pointers ───────────────────────────────────────────────
--
-- `restrict` in every direction: a pointer is how a document is found, and a
-- revision deleted out from under one would turn a published page into a page
-- with no body. The service clears the pointer first, in the same transaction.

alter table cms_page
  add column if not exists published_revision_id uuid
    references cms_page_revision(id) on delete restrict,
  add column if not exists preview_revision_id uuid
    references cms_page_revision(id) on delete restrict,
  add column if not exists wip_revision_id uuid
    references cms_page_revision(id) on delete restrict,
  add column if not exists checkpoint_revision_id uuid
    references cms_page_revision(id) on delete restrict;

create index if not exists cms_page_published_revision_idx
  on cms_page (published_revision_id);
create index if not exists cms_page_preview_revision_idx
  on cms_page (preview_revision_id);
create index if not exists cms_page_wip_revision_idx
  on cms_page (wip_revision_id);

-- ── the authored columns become legacy ─────────────────────────────────────
--
-- Kept, nullable, for one release: they are the backfill's rollback path, and
-- the running deploy is still reading them at the moment this runs. A later
-- schema step drops them.

alter table cms_page
  alter column body_mdx drop not null,
  alter column title drop not null,
  alter column description drop not null,
  alter column summary drop not null,
  alter column cta drop not null,
  alter column metadata drop not null,
  alter column sort_order drop not null,
  alter column content_updated_at drop not null,
  alter column content_updated_at drop default;

-- ── activity coalescing ────────────────────────────────────────────────────

alter table cms_page_event
  add column if not exists save_count integer not null default 1,
  add column if not exists first_at timestamptz;

-- ── media usage moves from pages to revisions ──────────────────────────────
--
-- The table is a cache of a pure function of `cms_page_revision`, so it is
-- emptied and re-derived rather than converted. Step 1 of the migration order
-- above does the truncate; this only reshapes the columns.

alter table cms_media_usage
  drop constraint if exists cms_media_usage_page_id_media_id_placement_pk;
alter table cms_media_usage drop column if exists page_id;
alter table cms_media_usage
  add column if not exists revision_id uuid not null
    references cms_page_revision(id) on delete cascade;
alter table cms_media_usage
  add constraint cms_media_usage_revision_id_media_id_placement_pk
    primary key (revision_id, media_id, placement);

commit;
