# Factura CMS — media library plan

> **Status:** proposed design for `cms.md` Task 6. No implementation exists yet.
>
> **Scope:** images used by CMS-authored pages in `/guias`, `/estadisticas`
> and `/investigaciones`. This does not change private bill-PDF storage, the
> generated social cards under `/og/**`, or other application uploads.
>
> **Revised** after review against the repository: nothing is deleted
> automatically, removal is a human action through a trash with a grace period,
> media can be grouped into flat collections, and unused assets are surfaced as
> two distinct states. §11.1 lists what is settled.

## 1. Outcome

Add a top-level **Medios** section at `/cms/media`, linked in the CMS header
after the authored sections and before the admin-only Tokens link. Editors can:

- drag one or several images onto the library;
- browse, search and select existing images;
- group images into flat, named collections;
- edit an image's default alt text and attribution;
- copy or insert a stable reference into a page;
- see every CMS page that uses an image;
- find images nothing references any more; and
- move an unused image to the trash, and empty the trash after a grace period.

The database owns media identity and editorial metadata. A separate
S3-compatible bucket owns the image bytes. Public pages render those bytes
through `next/image`; authored content never stores an R2 hostname, an S3
object key, or an expiring signed URL.

This remains an internal tool for a very small editorial team. The first version
does not need nested folders, transformations in the CMS, cropping, focal
points, video, audio, documents, stock-photo search, or a digital-asset-
management workflow.

One scope rule holds the rest of this design together, and it must be written
down before anything is built:

> **Library images are referenced only from CMS page content.** Site imagery
> referenced from React source — the landing teasers, the article list cards,
> any `.tsx` file — stays in `public/img/**` and stays out of the library.

Break that rule and the usage tracking in §3 is blind to the reference, the
“unused” filter lies, and the trash eventually deletes a live image.

### 1.1 The scale this is designed for

Measured against the repository and the local database while writing this plan:

| Quantity                              | Today |
| ------------------------------------- | ----- |
| CMS pages                             | 61    |
| Pages with a `previewImage`           | 33    |
| Pages with at least one in-body image | 11    |
| Files under `public/img/**`           | 48    |
| Total bytes under `public/img/**`     | 5 MB  |

Every in-body image already carries non-empty alt text, so the publish-time alt
rule in §3 passes on all current content without an editorial cleanup pass.

These numbers justify decisions further down that would be wrong at a larger
scale: a full re-derivation of the usage table is one query over ~61 rows, and a
full reconciliation against the bucket is one `ListObjectsV2` call. Neither
needs to be incremental to be fast, which is what makes them trustworthy.

## 2. Decisions

### 2.1 One stable media identity, separate from its URL

Every image gets an opaque, immutable UUID in `cms_media.id`. It is generated
once and is not derived from the filename or file hash. A hash is useful for
duplicate detection, but it is not identity: uploading the same pixels twice
may be intentional, while changing alt text must not change an image's address.

There are three different values and they must not be collapsed:

| Value               | Example                                       | Stored where                 | Purpose                                     |
| ------------------- | --------------------------------------------- | ---------------------------- | ------------------------------------------- |
| Media id            | `8f…c2`                                       | PostgreSQL and page metadata | Stable relational identity                  |
| Editorial permalink | `/media/8f…c2/medidor-de-luz.jpg`             | MDX body                     | Portable, human-readable reference          |
| Object origin       | `https://media.factura.uno/cms-media/8f…c2/…` | Derived from configuration   | Where `next/image` fetches the source bytes |

The filename in the editorial permalink is descriptive only. Resolution is by
UUID, so renaming the library title does not break an article. The route should
redirect a directly opened permalink to the configured public origin, while
the server-side MDX image component resolves it directly to a typed media
record before rendering.

The permalink's trailing extension is mandatory, not cosmetic. `src/proxy.ts`
matches everything except `/api`, `/app`, `/cms`, … and `.*\..*`, so
`/media/<uuid>/medidor.jpg` escapes the locale rewrite only because it contains
a dot. An extensionless permalink would be rewritten into `/es/media/…` and 404. Add `media` to the proxy's exclusion list as well, so the route does not
depend on a filename convention holding forever.

Do not put these in content:

- `https://<account>.r2.cloudflarestorage.com/**`;
- `https://pub-….r2.dev/**`;
- presigned URLs with query-string credentials;
- bucket names or object keys; or
- a deployment-specific CDN hostname.

This means moving from R2 to S3, Backblaze, or another CDN changes
configuration, not every article.

### 2.2 Preview images use ids; prose uses stable media permalinks

The two authoring cases have different data shapes:

**Preview image** is structured page metadata. Replace `previewImage: string`
with `previewMediaId: uuid`. The editor renders it as a media picker rather
than a text field. Repository reads batch-resolve the selected media records so
section lists do not introduce an N+1 query. During migration, the reader may
temporarily accept the old `/img/**` string, but all new CMS writes use the id.

This is a wider change than one field. The value is validated by _two_ separate
schemas — `PREVIEW_PATTERN` in `src/content-system/metadata/guias.ts` and the
inline regex in `src/content-system/metadata/sections.ts` — and it reaches the
UI as a bare string through `SectionMeta.preview` in `src/content/section.ts`,
which is consumed by `ContentArticle`, `ArticlePreview`, `ContentList`,
`GuideList` and the homepage. Both schemas gain and later lose the legacy
exception together; all five render sites move to the typed `MediaRef`.

**In-text image** remains ordinary Markdown:

```md
![Medidor digital con una lectura de 184 kWh](/media/8f…c2/medidor-de-luz.jpg)
```

That keeps the MDX source readable and portable, and lets the existing grammar
continue to treat images as Markdown rather than executable components. The
custom Markdown `img` renderer recognizes only Factura media permalinks (plus
temporarily supported legacy `/img/**` paths), resolves the UUID, and renders a
shared `MediaImage` component backed by `next/image`.

Raw external image URLs should be rejected by CMS validation. An editor must
import the image into the library first. This avoids remote-content changes,
tracking pixels, broken hotlinks, and an unbounded `remotePatterns` policy.

### 2.3 Alt text belongs to a use, with a library default

Alt text describes what an image means in its context; it is not an intrinsic
property of the file. The media row therefore stores `default_alt`, which is an
editable suggestion, while the actual in-text alt stays in Markdown. The
insertion flow pre-fills it from `default_alt` and lets the editor change it
before inserting.

An editor can explicitly mark the library image as decorative. That makes the
default alt empty and inserts `![](...)`. Blank alt without the decorative flag
is a validation error. The library detail view explains the distinction.

Preview thumbnails are currently adjacent to a page title and intentionally
render with `alt=""`; repeating the title is worse accessibility. Editing the
library default still matters for in-text uses and any future non-decorative
placement. A future placement whose image conveys information must store its
own alt override rather than silently reusing the library value.

### 2.4 Public source bytes, private write access

CMS media should use a **separate bucket and credentials** from private bill
PDFs, not merely another prefix in `S3_BUCKET`. The existing
`src/server/storage.ts` is explicitly private bill storage and the CMS boundary
test forbids importing it. Create a portable CMS media-storage adapter under
`src/cms/media/storage` (or a neutral storage module if the deployment split
needs it) with its own configuration:

```text
CMS_MEDIA_S3_BUCKET
CMS_MEDIA_S3_ENDPOINT
CMS_MEDIA_S3_REGION
CMS_MEDIA_S3_ACCESS_KEY_ID
CMS_MEDIA_S3_SECRET_ACCESS_KEY
CMS_MEDIA_S3_FORCE_PATH_STYLE
CMS_MEDIA_PUBLIC_ORIGIN
```

Only the application can list, put, or delete. Original/master image objects
are publicly readable at the configured origin because the Next.js default
image optimizer does not forward authentication headers when fetching a remote
source. On Cloudflare R2, production should use a controlled custom domain such
as `media.factura.uno`; `r2.dev` is a rate-limited development endpoint.

There are two key namespaces, and the distinction is what makes both
immutability and EXIF stripping possible at once:

```text
cms-media/_incoming/<reservation-id>                    # staging, disposable
cms-media/<media-id>/<sha256-prefix>.<canonical-ext>    # master, immutable
```

The browser's presigned `PUT` targets the **staging** key. Finalization reads
those bytes, validates them, normalizes EXIF orientation, strips GPS and other
metadata, writes the result to the **master** key, and deletes the staging
object. The master is therefore written once, by the server, from bytes it has
already inspected — and its `sha256` is the hash of what is actually served.

This resolves what would otherwise be a direct contradiction: a browser that
uploads straight to the final key cannot also have its EXIF stripped without
overwriting that key, and the stored hash would describe bytes that no longer
exist.

Never replace bytes at an existing master key. The first version has no
“replace file” operation: upload a new asset and move references to it.
Immutability makes CDN and Next.js optimizer caching safe, makes a hash mismatch
detectable, and lets `images.minimumCacheTTL` be set very high (§6).

Because the master key is namespaced by media id, two library entries holding
identical bytes are two distinct objects. Deleting one can never orphan the
other. `sha256` is a duplicate _warning_ at upload time and nothing more; it is
never used to share storage between rows.

Two bucket lifecycle rules do work that no application code should have to:

- expire everything under `cms-media/_incoming/` after 24 hours, which cleans up
  every upload that was reserved and abandoned; and
- `AbortIncompleteMultipartUpload` after 24 hours, which removes failed
  multipart parts. Those parts do not appear in an ordinary object listing and
  are billable, so nothing else would ever notice them.

### 2.5 Nothing is deleted automatically; the trash is the only path out

Three rules, and they are the reason this section is short:

1. **Removing an image from a page never deletes anything.** Editing a page
   only rewrites that page's usage rows. The asset stays in the library and
   shows up under “no longer used” (§5.1), where a human decides.
2. **Only a human, in the browser, can trash or purge.** There is no MCP tool
   that destroys media, matching the CMS MCP's existing contract for pages:
   deletion is a browser-only action a person performs at `/cms`.
3. **Trashing requires zero references.** A referenced image cannot be trashed;
   the dialog lists the pages and placements and links to each editor.

Removal is a two-stage, reversible transition:

```text
ready ──trash──▶ trashed ──(grace period elapses, or explicit purge)──▶ purged
   ◀──restore──┘
```

**Trashing** is a single `UPDATE` — status to `trashed`, stamp `trashed_at` and
`trashed_by`. No bytes move. The asset leaves the picker and the main grid and
appears in the Papelera tab, where **Restaurar** puts it back at any time before
purge.

**Purging** is what actually deletes bytes, and it happens only when the grace
period (30 days, configuration-backed) has elapsed, or when an editor explicitly
chooses “Eliminar definitivamente” in the Papelera. Either way it runs the same
sequence:

1. In one transaction, re-check `cms_media_usage` for the row. If a reference
   has appeared since it was trashed, restore it to `ready`, log the event, and
   stop.
2. Mark the row `purging`.
3. Delete the object idempotently.
4. Mark the row `purged`, retaining a tombstone (id, former object key, hash,
   who trashed it, who purged it, timestamps). A row stuck in `purging` because
   storage was unavailable is retried by the next run.
5. The permalink returns `410 Gone` from `trashed` onward.

Step 1 is what makes concurrent edits safe without row locking. The dangerous
interleaving — one editor trashes an unused image while another inserts it into
a page — is resolved thirty days later by a check that sees the new reference
and restores the asset. There is no window in which a live page points at bytes
that are already gone, and no `SELECT … FOR UPDATE` is needed on the page-save
path to guarantee it.

The grace period also replaces something this change quietly takes away. Today
these images live in git, so a mistaken deletion is a `git revert`. Once the
bytes are only in a bucket, that safety net is gone; a 30-day trash restores it
without keeping every abandoned upload forever, which is the whole point.

Purging removes the source object and future rendering. Previously generated
Next.js/CDN variants can remain in caches until their TTL expires unless the
deployment adds a provider-specific purge adapter. Media is public editorial
content, so the first version documents that cache window rather than coupling
the portable storage layer to Cloudflare's purge API. If “erase every cached
copy now” becomes a requirement, it is a separate infrastructure feature.

### 2.6 Collections are flat, single-parent, and never touch the object key

Editors want folders. Collections provide them as pure database metadata:

- **Never encode a collection in the object key.** Moving an image between
  collections would otherwise mean moving bytes, which breaks the immutability
  that §2.4 and §6 both depend on. The key is fixed at creation forever; the
  collection is a nullable column.
- **Single-parent, not many-to-many.** `cms_media.collection_id` rather than a
  join table: “which collection is this in” has one answer, the UI is a select
  instead of a multi-select, and every listing query stays a plain join.
  Promoting the column to a join table later is a small backfill, not a trap.
- **Flat, not nested.** At the scale in §1.1 a tree is furniture. A name like
  `Guías · Edesur` carries the same information as two levels of clicking.
- **Deleting a collection never deletes media.** It nulls the column; the
  images reappear under “Sin colección”.

Uploading while a collection is selected assigns that collection automatically,
which removes most of the filing work.

## 3. Data model

Add three `cms_` tables so they move with the CMS later.

### `cms_media`

| Column                                                | Notes                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `id uuid primary key`                                 | Stable media identity                                       |
| `status text`                                         | `pending`, `ready`, `trashed`, `purging`, `purged`          |
| `collection_id uuid null`                             | `set null` on collection delete; null is “Sin colección”    |
| `object_key text unique`                              | Internal; never returned to content authors                 |
| `original_filename text`                              | Display and audit information only                          |
| `display_name text`                                   | Editable library title, initialized from filename           |
| `mime_type text`                                      | Canonical, sniffed type rather than client claim            |
| `byte_size bigint`                                    | Validated upload size                                       |
| `width integer`, `height integer`                     | Required pixel dimensions                                   |
| `sha256 text`                                         | Integrity and duplicate warning; not identity               |
| `default_alt text`                                    | Editable; empty only when `decorative = true`               |
| `decorative boolean`                                  | Explicit accessibility decision                             |
| `attribution text`                                    | Optional human-readable credit/license note                 |
| `first_used_at timestamptz null`                      | Set once, when the row first gains a usage row; never reset |
| `last_referenced_at timestamptz null`                 | Moved forward on every save that still references it        |
| `created_by`, `updated_by`, `trashed_by`, `purged_by` | Nullable user foreign keys, matching page authorship policy |
| `created_at`, `updated_at`, `trashed_at`, `purged_at` | Timestamps                                                  |

Add indexes for newest-first listing, case-insensitive display-name/filename
search, hash duplicate checks, collection filtering, and the purge sweep over
`(status, trashed_at)`. Do not expose `object_key` or storage credentials
through browser props, MCP results, or audit logs.

`pending` is not cosmetic. It is the state that makes “no stray objects”
provable: a reservation row is committed **before** the presigned URL is issued,
so every key that could possibly exist in the bucket already has a row in
PostgreSQL. Without it, a successful `PUT` whose finalize call never arrives
leaves an object nothing in the database knows about.

The two usage timestamps are what let §5.1 distinguish an image that was never
placed from one that was replaced. Both are written by the same statement that
writes usage rows, so they cost one clause and no extra query:

```sql
first_used_at     = coalesce(cms_media.first_used_at, now()),
last_referenced_at = greatest(coalesce(cms_media.last_referenced_at, now()), now())
```

`coalesce`/`greatest` rather than plain assignment because the reconciliation
below rebuilds usage from scratch, and a rebuild must never move these
backwards or null them out. `last_referenced_at` means “the last save at which
this image was still referenced”, which is a lower bound on when it stopped
being used — not the moment of removal. Label it accordingly in the UI.

### `cms_media_collection`

| Column                                   | Notes                                      |
| ---------------------------------------- | ------------------------------------------ |
| `id uuid primary key`                    |                                            |
| `name text`                              | Editable label, unique case-insensitively  |
| `slug text unique`                       | For a stable filter URL                    |
| `description text null`                  | Optional note about what belongs here      |
| `sort_order integer`                     | Explicit sidebar order, ties break on name |
| `created_by`, `created_at`, `updated_at` | As elsewhere                               |

No `parent_id`: §2.6 decided flat. Media reference it with `on delete set
null`, so removing a collection is never destructive.

### `cms_media_usage`

| Column                | Notes                                             |
| --------------------- | ------------------------------------------------- |
| `media_id`            | `restrict`, as a backstop under the §2.5 flow     |
| `page_id`             | Cascades when a deletable page is removed         |
| `placement text`      | `preview` or `body`                               |
| `occurrences integer` | How many times, for the “used twice here” case    |
| `locators jsonb`      | Metadata field name, or MDX line/column positions |

Primary key `(page_id, media_id, placement)`. One row per placement with a
count, rather than one row per occurrence: the question this table answers is
boolean (“may this be trashed?”) and the UI only needs the list of pages. An
image used twice in one body is one row with `occurrences = 2`, which is also
the only shape a composite unique constraint can express without inventing an
ordinal.

Usage is derived, not hand-authored. On every accepted page save, the content
service parses `previewMediaId` and all `/media/<uuid>/**` Markdown image
destinations, validates that every media row is `ready`, then replaces that
page's usage rows and stamps the two timestamps above — all in the same
database transaction as the page update. Browser and MCP writes therefore
cannot disagree.

Publish-level validation additionally rejects trashed/purged/missing media and
missing in-text alt text. A reference to a trashed asset is rejected with a
diagnostic that says to restore it from the Papelera, rather than silently
resurrecting it. Drafts may contain an unresolved legacy `/img/**` path during
migration, but a newly inserted media UUID must always exist even in a draft.

### Usage is a cache of a pure function, and must be rebuildable

The incremental write above is a performance optimization, not the definition.
The definition is: **usage is a pure function of the current `cms_page` rows.**
Two consequences, and the second is the one that matters:

- Existing pages have no usage rows until they are next saved, so the initial
  state has to come from somewhere other than the incremental path.
- A derived table that can only be maintained incrementally can never be fully
  trusted, because any bug in the maintenance path leaves permanent, invisible
  drift.

So ship `reconcileMediaUsage()`: truncate and rebuild the whole table from all
pages in one statement. At the §1.1 scale this is milliseconds — the extraction
is a single query:

```sql
select id, m[2] from cms_page, regexp_matches(body_mdx, '!\[([^]]*)\]\(([^)]*)\)', 'g') m;
```

Run it on a schedule, from a “Recalcular” button in the media library, and as
the first step of any purge sweep. Drift then cannot persist, and the
incremental path no longer has to be perfect to be safe.

Page history is events, not body snapshots (`cms_page_event`, written by
`CmsPageHistoryStore`), so current bodies really are the complete set of
references. If history ever grows body snapshots, this whole model needs
revisiting — an old revision would hold references nothing counts.

## 4. Upload contract

### 4.1 Browser flow

The `/cms/media` page has a full-width drop zone and a normal “Seleccionar
imágenes” button backed by the same `<input type="file" multiple
accept="image/*">`. Dropping anywhere over the library reveals the target.
Each file gets its own progress row, success/failure state, and retry action; a
bad file does not cancel the rest of a batch.

Use direct-to-object-storage uploads so image size is not constrained by a
hosting provider's Route Handler body limit:

1. Browser asks a same-origin CMS route for an upload reservation with name,
   claimed type, byte size and target collection.
2. The service authorizes the member, applies rate/count/size limits, **commits
   a `pending` `cms_media` row**, and only then returns a presigned `PUT` to
   that row's staging key plus the required headers. The row exists before the
   URL does, which is the invariant from §3: the bucket can never hold a key
   PostgreSQL has not recorded.
3. Browser uploads the bytes to `cms-media/_incoming/<reservation-id>` and
   reports progress.
4. Browser calls finalize. The service reads the staged object, sniffs the
   actual file signature, decodes dimensions, normalizes orientation, strips
   metadata, writes the processed master to its immutable key, computes the
   hash **of the master**, deletes the staging object, and flips the row to
   `ready`.
5. Rows still `pending` past the reservation lifetime are swept: staging object
   deleted, row marked `purged` with a tombstone. The `_incoming/` lifecycle
   rule from §2.4 is the belt-and-braces backstop if that sweep never runs.

Note that finalize downloads and re-encodes the file in the application
process. At 20 MB and this upload volume that is fine; it is called out because
it is the one place in this design where request memory scales with input.

Presigned URLs are short-lived bearer credentials, scoped to one random object
key and exact content length/type where the provider supports those
conditions. Configure bucket CORS only for the CMS origins and `PUT`/`HEAD`; it
does not make write credentials public.

Initial guardrails should be configuration-backed, with these defaults:

- 20 MB per image;
- 20 images per batch;
- 40 megapixels after orientation;
- a short upload-reservation lifetime (for example 15 minutes); and
- per-member rate limiting in addition to the existing CMS request limit.

Validation trusts magic bytes and a successful decoder, never extension or
browser MIME alone. It rejects polyglots, truncated files, dimension bombs,
zero-sized images and metadata that exceeds safe parsing limits. Normalize
EXIF orientation and strip GPS/other unnecessary EXIF metadata before the
public master is finalized. Store only files that the public renderer can
decode.

### 4.2 Formats

The first release supports the major web raster formats:

- JPEG (`image/jpeg`);
- PNG (`image/png`);
- WebP (`image/webp`);
- AVIF (`image/avif`); and
- GIF (`image/gif`), including animation.

Static raster images render through optimized `next/image`. Animated GIFs are
still rendered through the shared component but with `unoptimized`, because
optimizing the first frame as a static image would change the asset.

SVG is deliberately not in the first-release list. It can contain scripts,
external references and other active content; Next.js also recommends special
CSP/attachment handling when SVG is enabled, and vector files do not benefit
from raster optimization. Add it later only with a real sanitizer, a restrictive
CSP, `unoptimized`, and dedicated tests. TIFF/BMP/HEIC are import formats rather
than reliable web delivery formats; a later ingestion step may decode and
convert them to a supported master without changing the rest of this model.

This interpretation of “major formats” is an explicit product decision to
confirm before implementation (see §11).

## 5. Media library interface

### 5.1 List

`/cms/media` is dynamic and uncached. It shows a responsive thumbnail grid with:

- image preview;
- display name and original filename;
- dimensions, format and file size;
- default-alt/decorative status;
- collection;
- usage count; and
- upload date and author.

A sidebar lists the collections from §2.6 with counts, plus virtual views that
need no schema of their own:

| View              | Query                                         |
| ----------------- | --------------------------------------------- |
| Todas             | `status = 'ready'`                            |
| Sin colección     | `collection_id is null`                       |
| **Nunca usadas**  | no usage rows and `first_used_at is null`     |
| **Ya no se usan** | no usage rows and `first_used_at is not null` |
| Papelera          | `status = 'trashed'`, with days remaining     |

Splitting “unused” in two is what makes the view actionable. An image uploaded
five minutes ago and an image dropped from a guide last month both have zero
references, but only the second is obviously safe to remove — and it is the
case that motivates the feature, since a replaced image is exactly what would
otherwise sit in the bucket forever. “Ya no se usan” shows _usada por última vez
el …_ from `last_referenced_at`.

Draft and archived pages count as usage. Say so on the row — “usada por 1 página
(borrador)” — so a blocked trash action is never mysterious.

Controls: search name/filename/alt, filter by collection, usage state and
format, and sort newest/oldest/name/file size. Pagination or cursor loading is
required; never list the bucket to _build this screen_. PostgreSQL is the
catalog and the bucket is bytes only.

That rule is about rendering, not about auditing. A separate **Reconciliar**
action does exactly what the grid must not: one `ListObjectsV2` over the prefix,
diffed against `cms_media`, reported as “N objetos huérfanos, M filas sin
objeto”. It is the only check that can catch a bug in the purge path rather
than assuming it worked, and at §1.1 scale it is a single API call. Pair it with
the `reconcileMediaUsage()` rebuild from §3 behind one button.

If no scheduled runner exists when this ships, the Papelera tab showing “N
elementos listos para eliminar” with a button is a sufficient purge trigger for
a two-person team. A cron can automate it later without changing the model.

Selecting a card opens `/cms/media/<id>` (a page or accessible drawer) with the
large preview, editable metadata, collection selector, stable permalink, copy
actions, usage list, and trash action. Saving alt/name/attribution/collection
uses optimistic concurrency, matching page edits.

### 5.2 Picker and insertion

Build one reusable media picker for both placements:

- **Choose preview image** writes `previewMediaId` and shows a 16:9 preview.
- **Insert into article** opens from the Markdown editor toolbar, asks for alt
  (pre-filled from the default), and inserts Markdown at the cursor.
- **Copy Markdown** on a media detail/card copies the same syntax for editors
  who prefer source editing.
- **Upload and select** lets an editor drop a new file without leaving the
  picker, then selects it after finalization.

The picker only ever offers `ready` media. Trashed assets are invisible to it;
restoring one is a deliberate trip to the Papelera.

The picker never inserts an object-origin URL. The PageEditor should preserve
the exact Markdown string; no WYSIWYG rewriting is introduced by this task.

## 6. Rendering with Next.js Image

Replace the raw `<img>` implementations for CMS-controlled previews and MDX
images with a shared server component around `next/image`. The database already
holds the remote image's width and height, which Next.js requires to reserve
aspect ratio and avoid layout shift.

Configure `next.config.ts` with a narrow `images.remotePatterns` entry for the
exact `CMS_MEDIA_PUBLIC_ORIGIN` protocol, hostname, port and `/cms-media/**`
path. Do not use deprecated `images.domains` or a wildcard Cloudflare hostname.
Next.js 16 **requires** an explicit `images.qualities` allowlist — the installed
16.2.9 docs state the field became mandatory precisely so an attacker cannot
request arbitrary transforms — so set `qualities: [75]` and widen it only if
design review proves another value is needed.

Set `images.minimumCacheTTL` high. Master keys are immutable by §2.4, so a
long optimizer cache is free: the bytes behind a URL can never change, and a
replaced image is a new id and a new URL.

The shared component owns:

- resolved source URL, intrinsic width and height;
- alt text and decorative behavior;
- responsive `sizes` appropriate to article (maximum 680 px), preview card and
  sidebar placements;
- lazy loading by default, with eager/high-priority loading only when a measured
  above-the-fold placement needs it;
- the existing borders, aspect-ratio crops and object-fit rules; and
- the animated-GIF `unoptimized` escape hatch, not author-controlled, extended
  to any asset whose decoded dimensions approach the megapixel ceiling in §4.1
  — a 40 MP master should be served as-is rather than making every cold cache
  pay for a slow transform.

The public repository should return a typed `MediaRef` to layouts rather than a
bare string. The MDX component resolver may query by ids collected from the
body in one batch before render; it must not issue one database query per image.
Unknown, trashed or purged ids are validation failures, while the public renderer uses
a non-crashing missing-image placeholder and logs the invariant breach.

Because source keys are immutable, optimized variants may be cached for a long
time. Alt-text edits do not need image-cache invalidation: alt lives in page
HTML, so saving a published page uses the existing section tag invalidation.

`default_alt` is Spanish, like the rest of the content. When the i18n work adds
English routes, alt text becomes per-locale; that is a second column on this
table and an override at the point of use, not a redesign. Recording it here
means the i18n phase discovers it in a plan rather than in production.

## 7. MCP feasibility and surface

Uploading through the CMS MCP is feasible, with one limitation: MCP tool inputs
are JSON Schema values and the protocol does not define a portable client-to-
server file attachment. MCP image/blob content is designed for results and
resources; sending a large image as base64 inside tool arguments is possible
but inefficient and poorly supported across clients.

Use the same reservation flow as the browser:

| Tool                    | Scope       | Purpose                                                                              |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `list_media`            | `cms:read`  | Search/list catalog records and stable permalinks                                    |
| `get_media`             | `cms:read`  | Metadata and usage references for one asset                                          |
| `create_media_upload`   | `cms:write` | Reserve an upload and return a short-lived presigned `PUT`                           |
| `complete_media_upload` | `cms:write` | Validate uploaded bytes and create the media record                                  |
| `update_media`          | `cms:write` | Edit default alt, decorative flag, name, collection or attribution with lock version |

**No destructive media tool exists**, deliberately and permanently. The CMS MCP
already tells its clients that it cannot delete anything and that removal is a
browser-only action a person performs at `/cms`; media follows pages rather than
carving out an exception. An agent that wants an image gone leaves it unused,
where §5.1's “Ya no se usan” view surfaces it for a human to trash.

An agent calls `create_media_upload`, transfers its local file to the returned
URL with an ordinary HTTP `PUT`, then calls `complete_media_upload`. This works
for capable agents without pushing binary through the model context. Tool
instructions must say that upload URLs are secrets until expiry and must never
be pasted into article content, logs, or the media metadata.

Return `id`, stable editorial permalink, dimensions and MIME type from
completion so the agent can immediately use it in `previewMediaId` or Markdown.
Add media tool descriptions to `src/content/AUTHORING.md` when they ship.

Do not add base64 upload in the first version. If real MCP clients cannot
perform the `PUT`, a tightly size-limited `upload_media_base64` can be added as
a compatibility fallback after measuring that need. A server-side
`import_media_from_url` is also deferred: it needs strict SSRF defenses,
redirect and size limits, and an explicit rule about third-party rights.

Media mutations call the same `CmsMediaService` as browser actions. They use
the existing membership adapter, token scopes, rate-limit bucket, optimistic
concurrency, and audit conventions; the MCP must not access S3 or tables as a
second implementation. Trash, restore and purge live on that service too, but
are reachable only from the browser transport.

## 8. Service and module boundaries

Add a `src/cms/media/**` feature with the same layers as pages:

```text
src/cms/media/
  components/          # drop zone, grid, detail, picker
  server/
    service.ts         # transport-independent media rules and authorization
    store.ts           # cms_media, cms_media_collection, cms_media_usage
    storage.ts         # S3-compatible adapter
    uploads.ts         # reservation/finalization and validation
    usage.ts           # extraction + reconcileMediaUsage()
    purge.ts           # trash sweep, bucket reconciliation
  validation/
  types.ts
```

Thin routes live under `src/app/(cms)/cms/media/**` and
`src/app/api/cms/media/**`. MCP tool adapters stay under `src/cms/mcp` and call
the service. Public rendering receives media through a small read contract in
`src/content-system`; it must not import CMS UI or mutations.

The media adapter must not reuse `@/server/storage`, because that module is
private bill-PDF storage and is intentionally forbidden by the CMS boundary.
Shared low-level S3 client construction may be extracted only if it remains
domain-neutral and cannot mix bucket configuration or object prefixes.

## 9. Migration and rollout

1. Add tables, storage adapter, upload validation, service tests and local
   MinIO media bucket. Keep the bucket separate even in Docker Compose — a
   second `mc mb` line in the existing `minio-init` service.
2. Add `/cms/media`, the header link, collections, upload/edit/trash/restore
   flows and browser runtime verification.
3. Add the public permalink resolver and `MediaImage`; configure the exact
   public origin and switch CMS-controlled render sites to `next/image`.
4. Add `previewMediaId`, the picker, usage extraction, `reconcileMediaUsage()`
   and validation. Temporarily read both new ids and old `previewImage` paths in
   both metadata schemas.
5. Import the 33 referenced previews and the 11 in-body images. Preserve bytes,
   create media rows, rewrite database content and metadata in one audited
   migration, and validate every affected page. Seed collections from the
   sections the images came from, then run `reconcileMediaUsage()` and backfill
   `first_used_at` / `last_referenced_at` for everything it finds referenced —
   otherwise every migrated image reports as “nunca usada”.
6. Compare public pages visually and verify generated `srcset`, intrinsic
   dimensions, alt behavior, 404/410 paths, and cache headers.
7. Remove the old string metadata field and legacy-path exception only after no
   database page references it. Repository files can remain for unrelated site
   imagery.
8. Add MCP tools and update the authoring specification, including the note that
   `previewImage` is now an id and that no media tool can delete. MCP upload can
   follow the browser release; the data model and service do not depend on it.
9. Update `cms.md` Task 6 and its decision log with the implemented result, and
   update `src/content/AUTHORING.md` §7, which currently tells authors that
   preview images live in the repository and that adding one is a commit.

The schema arrives through `bun run db:push`; there is no `drizzle/` migrations
directory in this repo. The content rewrite in step 5 is a script under
`scripts/`, run against local first and then production, dry-run before write —
the same discipline as the other production data scripts.

Do not bulk-delete migrated files from `public/` in the same deploy that first
switches references. Keep one rollback window, then remove only files proven to
have a ready media row and no code/content reference.

## 10. Verification and acceptance criteria

Run the repository floor in order: `bun run build`, `bun run lint`,
`bun run typecheck`, and `bun run test`. The database integration tests below
are not in that floor — they need `bun run test:db`, which loads `.env.local`.
Media work additionally needs:

- unit tests for signature/type/dimension validation, permalink parsing, alt
  rules, usage extraction and trash/purge decisions;
- a test that `reconcileMediaUsage()` over a seeded corpus produces exactly the
  rows the incremental path produced, and that a rebuild never moves
  `first_used_at` / `last_referenced_at` backwards;
- a test that purging an asset which gained a reference while trashed restores
  it instead of deleting the object;
- database integration tests proving a page save and usage rows are atomic;
- storage-contract tests against MinIO for reserve, upload, finalize, abandoned
  cleanup, idempotent purge, bucket reconciliation and failure recovery;
- authorization tests for browser and every MCP tool;
- MCP protocol tests for schemas, annotations, scopes, audit behavior and an
  end-to-end presigned upload;
- render tests proving exact remote patterns, width/height, responsive sizes,
  optimized raster output and animated-GIF fallback;
- migration tests that every old CMS image maps once and no rewritten reference
  is unresolved; and
- browser verification after signing in locally: multi-file drag/drop,
  progress/errors, metadata editing, collection assignment, preview selection,
  Markdown insertion, public and private preview rendering, usage blocking,
  then trashing an unused asset, restoring it, and purging it for good.

The task is accepted when:

- Medios is visible in the CMS header to authorized editors;
- drag/drop and file selection upload the supported formats;
- default alt is editable and every non-decorative in-text use has alt text;
- preview and in-text references survive a storage-origin hostname change;
- every CMS-controlled raster image renders through `next/image` with known
  dimensions;
- referenced media cannot be trashed, while unused media can, and a trashed
  asset can be restored until the grace period elapses;
- removing an image from a page deletes nothing;
- the library separates “nunca usadas” from “ya no se usan”;
- bucket reconciliation reports zero orphaned objects and zero rows without an
  object after a full upload/trash/purge cycle;
- no _authored_ content contains an object key, signed URL or provider hostname
  — the rendered HTML necessarily does, inside the `/_next/image` source
  parameter, and that is the point of routing through the optimizer;
- the media bucket cannot be written without CMS credentials; and
- an MCP-capable agent can reserve, transfer and finalize an image without
  receiving general bucket credentials.

## 11. Decisions

### 11.1 Settled

- **Nothing is deleted automatically.** Removing an image from a page rewrites
  usage rows and nothing else. The “ya no se usan” view is the cleanup
  mechanism, and a human drives it. (§2.5, §5.1)
- **No destructive media tool over MCP**, matching the CMS MCP's existing
  contract for pages. (§7)
- **Trash with a 30-day grace period** rather than immediate deletion, which
  also replaces the accidental backup that git provides today. (§2.5)
- **Unused splits into “nunca usadas” and “ya no se usan”**, carried by two
  timestamps written in the transaction that already writes usage rows. (§3)
- **Collections are flat, single-parent, and never appear in an object key.**
  (§2.6)

### 11.2 Still to confirm

1. **Format scope:** ship JPEG, PNG, WebP, AVIF and GIF first; defer SVG and
   HEIC/TIFF conversion. If “all major formats” is intended to include SVG or
   iPhone HEIC on day one, upload sanitization/conversion becomes part of the
   first milestone.
2. **Cache window after purge:** accept that already-cached public variants
   expire on cache policy rather than promising immediate global erasure.
   Immediate purge would add a provider-specific CDN integration and weaken the
   S3-compatible portability goal.

Everything else above can be implemented without a further product choice.

## 12. Constraints checked for this plan

Verified against this repository:

- `src/cms/boundaries.test.ts` already forbids `@/server/storage` inside
  `src/cms/**`, so the separate media adapter in §2.4 is an existing rule, not a
  new preference.
- Next.js 16.2.9 is installed; its bundled `image.md` documents `qualities` as
  required from 16.
- `src/proxy.ts` excludes paths containing a dot, which is the only reason a
  `/media/<uuid>/<name>.jpg` permalink survives the locale rewrite today.
- Page history stores events, not body snapshots, so current page bodies are the
  complete set of media references.
- In-body images render through a bare `<img>` in `src/mdx-components.tsx`;
  `previewImage` reaches five render sites as a plain string via
  `SectionMeta.preview`.

External:

- Next.js 16 remote images require an allowed `remotePatterns` source and known
  dimensions; its optimizer does not forward authentication headers. The
  project must use `next/image` through a public, narrowly allowed media origin.
- Cloudflare R2 custom domains are intended for public production delivery and
  can use Cloudflare caching. The managed `r2.dev` URL is for development and
  is rate-limited. Presigned R2 URLs use the S3 API hostname, cannot use the
  custom domain, and are bearer credentials — good for upload, wrong for page
  content.
- MCP tools accept JSON-Schema inputs. Binary blobs/images are standardized as
  returned content/resources, not as a portable file-upload argument. A
  presigned transfer coordinated by two MCP tools is therefore the interoperable
  design.

References:

- [Next.js Image component](https://nextjs.org/docs/app/api-reference/components/image)
- [Cloudflare R2 public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP schema reference](https://modelcontextprotocol.io/specification/2025-06-18/schema)
