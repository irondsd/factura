# Factura CMS

A private, database-backed publishing console for `factura.uno`, with a separate
MCP endpoint so agents can do the same work. It is in production: `/guias`,
`/noticias`, `/estadisticas` and `/investigaciones` are served from PostgreSQL, edited at
`/cms`, and illustrated from the media library at `/cms/media`. There are no
`.mdx` sources on disk any more, and no filesystem fallback behind the database.

This file is the system reference: what the CMS is, how it behaves, and the
rules you cannot infer from the schema. **Writing an article is a different
question — `src/content/AUTHORING.md` is that spec.** Table shapes are in
`src/db/schema.ts`, which is commented and is the authority on columns.

It is an internal tool for two people, not a general-purpose CMS. `/normativa`
is a hand-built page and is not part of it.

## Where the code lives

```text
src/cms/               the CMS: auth, editor components, forms, mcp/, server/, media/
src/content-system/    shared with the public site: component manifest, repository,
                       pure validators, metadata schemas, hierarchy, media contract
src/app/(cms)/**       CMS routes — transport only
src/app/api/cms/**     CMS MCP and media routes — transport only
```

Rules that are tested (`src/cms/boundaries.test.ts`), not merely intended:

- `src/cms` never imports bill-app code (app shell, tRPC routers, parsers,
  insights, private bill storage). The CMS is meant to move to its own
  deployment as one module.
- `src/content-system` never imports `src/cms`. The public site reads content
  through the repository contract, never through CMS code.
- Route files hold no rules. Both transports call the same
  `CmsContentService` — the MCP is a second caller, never a second
  implementation.
- Only the page/content stores, the category- and author-usage stores and
  `src/content-system/repository/postgres.ts` query `cms_page`; only
  `src/cms/server/revisionStore.ts` writes revisions.
- New tables carry a `cms_` prefix.

## Lifecycle

Each page is in exactly one state:

| Status      | In `/cms` | Its public URL                    | Listings, sitemap, feed |
| ----------- | --------- | --------------------------------- | ----------------------- |
| `draft`     | visible   | 404                               | excluded                |
| `preview`   | visible   | rendered with `noindex, nofollow` | excluded                |
| `published` | visible   | rendered normally                 | included                |

A `draft` is indistinguishable from a missing page to a public caller, on
purpose. A public `preview` URL is deliberately shareable — a discoverability
control, not an access control, so nothing private goes in one.

There is no archive state and no hard-delete button: a page that should go away
goes back to `draft`. Deleting for good exists in the browser only, and only for
a childless draft.

## The copies of a page

Editing never changes the published article. A page holds a bounded set of
stored copies (`cms_page_revision`), and `cms_page` points at them:

- **working copy (`wip`)** — one shared mutable draft, private to the CMS. The
  only kind ever updated in place, the only kind no reader can reach.
- **checkpoint** — one immutable copy of the working copy from before the
  current 24-hour editing window, so a batch of rapid saves can be undone
  without keeping a row per keystroke.
- **preview** — one immutable snapshot, promoted explicitly, served at the
  page's URL while the page is in `preview`.
- **publications** — the current one plus three previous. Immutable.

Bounded on purpose: every retained copy pins the images it references, so
unlimited history means a media library nobody can clean.

What that implies day to day:

- **Saving is always safe.** A save writes the working copy; the live article
  keeps serving its last publication until somebody publishes.
- **Publishing** validates the working copy, files an immutable publication,
  repoints the page, deletes the working copy and checkpoint, and prunes to
  three previous publications. Publishing a working copy identical to what is
  live is refused rather than filing a duplicate.
- **Unpublishing** sets the page to `draft`, keeps the last published pointer,
  and drops the preview snapshot. Republishing with nothing new re-exposes the
  retained publication rather than copying it.
- **Restoring** copies a retained version into the working copy. It publishes
  nothing and changes no status.
- **Discarding** throws the working copy away, and is refused when it is the
  page's only content.
- `cms_page.lock_version` is the single concurrency token. Every accepted
  mutation bumps it, a save included; a caller holding a stale version gets a
  conflict, never a silent overwrite.
- Every page, revision, pointer and media-usage change in one operation commits
  in one transaction.

History lives in two places, deliberately: **versions** (the seven copies above,
which you can open, compare and restore) and **activity** (`cms_page_event` — at
most ten rows per page, a run of saves coalesced into one, never any bodies).
Comparison has one baseline, the live or last publication.

## Caching, and what a reader sees

Public reads are wrapped in `unstable_cache` at the call site
(`src/content-system/repository/guias.ts`, `sections.ts`) with a literal
`revalidate: 3600` and the section's tag, `content:<section>`
(`repository/tags.ts`). A route inherits the tags of the cached reads it ran, so
one tag reaches the article, the indexes, the category hubs, the related rail,
the sitemap, the feed, `llms.txt` — and the cached 404 of a path that had no
page until now. A cached read missing its tag is a surface that keeps serving
the old copy after a publish, with no symptom for an hour.

The CMS expires that tag when, and only when, a write changes something a
visitor can see: publishing, promoting or refreshing the public preview,
unpublishing, returning a preview to draft, and renaming a page that was ever
public. **No save expires anything, in any status** — it changed nothing
public. Invalidation is `revalidateTag(tag, { expire: 0 })` from the content
service, best-effort: the row is already committed, so a failed expiry is logged
rather than reported as a failed publication, and the one-hour TTL is the
fallback underneath it.

Routes keep `dynamicParams = true`, so a page created after a deployment renders
on its first request. `generateStaticParams` is a build-time warm-up, never an
allowlist.

## Addresses

`cms_page.slug` holds the **full path** — `inflacion-de-vivienda/gba` — so a
public read is one indexed equality lookup. `parent_id` carries the editorial
tree an author reorders. The invariant between them, checked on every write in
`checkHierarchy`: a child's slug is its parent's slug plus one segment. The
rules also refuse cross-section parents, cycles, and a nested path with no
parent row.

Hierarchy is universal across sections. Guides all sit at the top level today;
that is a fact about the content, not a limitation of the model. The same
applies everywhere else a section differs: **sections differ in data — registry
entries, metadata schemas, component availability — never in branches.**
`if (section === "estadisticas")` in a list, an editor, a breadcrumb, a sitemap
or a validator is the thing this design exists to prevent.

**Renaming.** A page's address can change, from «Dirección» in the editor
sidebar. It is not a field in the metadata form, because the slug is on the page
row: a rename moves the _live_ URL the moment it commits, while everything else
in that form waits for a publish. One transaction does three things:

- the page moves, and every descendant moves with it — the slug is the full
  path, so a hub's children are part of its address;
- every vacated path that was ever public becomes a row in `cms_page_redirect`,
  and the public routes answer it with a 308 to the page's current address;
- any redirect standing where a page now lives is dropped.

The redirect row points at the **page**, not at a path, so the destination is
resolved live: three renames later every old address is still one hop, chains
cannot form, and a loop cannot be expressed. A live page always wins over a
redirect (creating a page at a redirected address clears it too), and a redirect
into a page the public can no longer see answers null rather than bouncing a
reader from one 404 to another. Rules in `src/cms/rename.ts`, execution in
`CmsContentService.rename`, the read in `PostgresContentRepository.redirectFor`.

Renaming is browser-only, like deleting: the MCP has no tool for it.

## What is in a page

**Restricted MDX, not JavaScript.** Allowed: Markdown, registered components,
literal schema-validated props, and children only where the manifest allows
them. Rejected: `import`/`export`, expressions, functions, event handlers,
spread attributes, inline scripts, unknown components, unknown or invalid props,
and a component used in a section it is not registered for. Forbidden syntax is
never silently stripped — it is refused with a line/column error.

**The component manifest** (`src/content-system/components`) is the single
source of truth for which components exist, which sections may use them, what
their props are, and whether they take children. Rules are split from bindings
so validators need no React. A new component is unusable until it is deployed.

**Categories are section-owned CMS records.** Their immutable `key` is stored
in page metadata; their editable `slug` is only the public address. The same key
can therefore exist independently in every section. Category copy and order can
be created or edited by a person or MCP agent. Changing a category slug creates
a one-hop permanent redirect, and both that operation and category deletion are
browser-only. Deletion retires the record and is refused while any current
working, preview or published revision uses its key. Validators resolve the
active keys from PostgreSQL for the page's own section.

**Authors are people, not accounts.** `cms_author` is a separate list from
`cms_member`: a member may sign in, an author is a byline, and revoking
someone's console access must not rewrite the attribution of everything they
wrote. Not section-scoped — the same person writes a guide and a research page.
A page names them in its revision metadata (`authorId`, `factCheckerId`), so a
publication keeps the attribution it was published with and the history panel
diffs a credit like any other field. Both are optional; a page with neither is
published by the organization. Managed from a modal on `/cms` and deliberately
absent from the navigation. Agents may _credit_ an author through ordinary page
metadata and read the list via `list_authors`, but creating and editing one is
browser-only. No `lock_version` (edited twice a year by two people) and no
`retired_at` (nothing can be removed yet, which is one column the day it
matters). Nothing renders an author yet: today they reach readers only as the
`Person` in each article's structured data, and as `reviewedBy` on the `WebPage`
node a fact-checked page emits.

**Metadata is data, never a `meta` export in the body.** Identity and commonly
queried values are columns; the rest is JSONB validated by one Zod schema per
section, shared by the form, the mutations, the MCP and public rendering. A
draft may be editorially incomplete, but its metadata must still be the right
_shape_ to store, because everything downstream assumes a row can be read back.
Editors never see raw JSON: the form is described as data in
`src/cms/forms/fields.ts`.

## Validation

Four pure layers, in `src/content-system/validation`:

1. **grammar** — parse MDX without evaluating it; reject everything in the list
   above.
2. **document** — metadata schema, dates, titles and lengths, headings, links,
   FAQ placement, CTA conventions, read time.
3. **collection** — unique slugs, cannibalising titles and descriptions,
   canonical targets, links to missing or unpublished pages.
4. **render** — compile against the real registry, because "the grammar is
   fine" and "React can render this" are different claims.

Which level applies depends only on where the page is going:

- **Save** — grammar only, whatever the page's status. A working copy no reader
  can reach must not be held to the rules a public page meets, or unfinished
  work could not be saved on a live article.
- **Promote to public preview** — grammar + document.
- **Publish** — all four.
- **Unpublish or return to draft** — never gated. Taking a page down is the
  recovery action; gating it would block exactly the pages that need it.

Warnings are shown in the Validation tab and never disappear silently; they do
not block publication.

## The two ways in

**`/cms`**, for people. One dynamic route set driven by the section registry
(`src/cms/sections.ts`), so adding a section is a registry entry plus a metadata
schema, not a second editor:

```text
/cms                            section index
/cms/[section]                  content list, filtered by status, searchable
/cms/[section]/new              create
/cms/[section]/[id]             editor: Markdown | Vista previa | Validación | Historial
/cms/[section]/preview/[id]     private preview of the last saved value, never cached
/cms/tokens                     MCP token management (admin only)
```

The section segment mirrors the public path: `/cms/investigaciones` edits what
readers see at `/investigaciones`. `tokens`, `new` and `preview` are therefore
reserved segments. A page opened under the wrong section's URL is a 404. The
editor is CodeMirror 6 source editing with a metadata sidebar, explicit save
(no autosave), conflict recovery that preserves the losing text, and a
confirmation on every consequential action that names the copy it moves.

Anonymous visitors are redirected to `/login`; signed-in non-members get
nothing that reveals editor data. Membership is an explicit allowlist with no
self-service path.

**`/api/cms/mcp`**, for agents. The same service behind scoped tokens, with
membership re-checked per call, its own rate-limit bucket and metadata-only
audit rows. Reads need `cms:read`, mutations `cms:write`; the ordinary Factura
MCP endpoint stays read-only and never gets these tools.

```text
list_content  get_content  create_content  update_content  validate_content
set_content_status
list_content_versions  get_content_version  compare_content_version
restore_content_version  discard_content_wip
list_media  get_media  create_media_upload  complete_media_upload  update_media
```

The rules an agent must know:

- **Editing a published page needs no permission.** `update_content` saves the
  working copy; the public keeps seeing the last publication. Save normally.
- **`set_content_status` is the only tool that changes what the public sees,
  and it needs the human's explicit yes every time, in both directions.**
- **Nothing here deletes.** No page tool, no media tool. A page is retired by
  status; an image is left unused for a person to trash. Deleting and renaming
  are browser-only actions.
- `create_content` always creates a `draft`. Every mutation carries
  `expectedLockVersion`, so `get_content` first.
- Tools return structured diagnostics, not only prose.

## Media library

Images are rows in PostgreSQL plus objects in a **separate public bucket**, at
`/cms/media`. Two sentences carry the whole design: **nothing deletes bytes
automatically, and nothing trusts the browser.**

- Identity is an opaque UUID. Bodies reference an editorial permalink,
  `/media/<id>/<name>.<ext>`; page metadata references the bare id
  (`previewMediaId`). Storage URLs never appear in content, and the permalink's
  extension is required — the locale proxy would otherwise rewrite it away.
- Uploads are direct-to-storage: reserve (which commits a `pending` row before
  the presigned URL exists), upload to a staging key, then finalize — the server
  sniffs magic bytes, decodes, strips EXIF/GPS, writes the master, hashes it and
  flips the row to `ready`. JPEG, PNG, WebP, AVIF, GIF. **No SVG.**
- Masters are immutable. There is no "replace file": upload a new asset and move
  the references.
- Alt text belongs to the _use_, in the Markdown; the row carries an editable
  default. Blank alt without the decorative flag is a validation error.
- Usage (`cms_media_usage`) is keyed by **revision**, which is what makes a
  retained publication keep its images alive. It is a cache of a pure function
  of the stored revisions, so `reconcileMediaUsage()` is a first-class operation
  and extraction is deliberately generous — a missed reference eventually
  deletes bytes a live page points at.
- The only path out is the trash: zero references required, 30-day grace, purge
  re-checks usage in the transaction that claims the row. Browser only.
- An author's portrait is the one reference `cms_media_usage` cannot hold — that
  table is keyed by revision and a portrait belongs to an author row. The trash
  and purge gates therefore test two predicates, both inside the removing
  statement, and the detail screen names the author so a refusal has a visible
  cause.
- The library grid is built from PostgreSQL, never by listing the bucket.
  Bucket reconciliation is a separate sweep (`scripts/mediaSweep.ts`).

## Operations

- The local PostgreSQL is the development and testing target. Use it freely.
  `bun run test:db` runs the integration suites; they skip without it.
- **Never point local development, tests or agent verification at production.**
  `src/cms/server/testDb.ts` refuses a non-local host. Anything that must reach
  production says so through a `:prod` script that loads `.env.prod`.
- Back up before any production schema change. `.env.prod` points at the Neon
  **pooler**, which is wrong for DDL: drop `-pooler` from the host, and pass
  `prepare: false` on any `postgres()` client going through the pooled one.
- CMS membership is granted by hand in SQL. Removing the row removes authority
  on the next request, including for tokens that account minted.
- CMS API tokens are shown once, stored as a SHA-256 hash, and are
  write-capable against live content. Mint them only when something needs one.
- Never log MDX bodies, metadata payloads, session cookies or token values.
- `unstable_cache` entries live in `.next/cache`, which platforms restore
  between builds — **a deploy does not flush them.** The CMS expires them
  itself on every publicly visible write, so that is covered; what is not is a
  change the CMS did not make. Repairing content with SQL leaves the old copy
  served until the TTL expires. Fix content through `/cms` or the MCP; clear
  `.next/cache` when verifying locally.
- CI builds one deterministic in-memory fixture per section and checks those
  pages across the sitemap, feed and `llms.txt`. It needs no `DATABASE_URL`, and
  publishing never requires a repository change.

## Known gaps

- **The audit trail is incomplete.** `cms_audit_log` records MCP mutations only.
  Browser mutations write to `cms_page_event`, which covers content changes from
  either caller but not token mints, revocations or refused attempts, and is
  scoped to one page rather than filterable across the CMS.
- **There is no rollback switch.** No section falls back to the filesystem; the
  `.mdx` sources are gone. Rollback is restoring rows, or redeploying the
  previous build if the schema is what broke.
- **History is bounded**, so "what did this say on Tuesday afternoon" has no
  answer unless Tuesday was published or checkpointed. Comparison has one
  baseline; two arbitrary versions cannot be compared.
- IndexNow is still submitted by hand, after deploying.
- The CMS and the bill app share Auth.js identity and one physical database.

## Still to build: a richer editor

The editor is deliberately plain — a source editor, not a WYSIWYG — and that is
the one place where plainness now costs more than it buys. Worth having, in
rough order:

- component-name and property autocomplete from the manifest, an explicit
  `Mod-Shift-K` assistant, safe component/recipe templates, and inline
  documentation are shipped in the source editor;
- a formatting toolbar and keyboard shortcuts;
- side-by-side source and preview.
