# Factura CMS

> **Status:** in production. `/guias`, `/estadisticas` and `/investigaciones`
> are served from PostgreSQL on `factura.uno`, edited at `/cms`, and illustrated
> from the media library. The migration is done and the branch is merged.
>
> A private, database-backed publishing console, with agent access through a
> separate CMS MCP endpoint.
>
> Sections 1–9 are the design reference: what the system is and why it is shaped
> that way. Section 10 says what exists and what does not, section 11 is how to
> operate it, and section 12 is the forward work. None of that is a blocker —
> the system runs today; §12 is what would make it better.

## 1. Objective

Move published content out of application source files and into PostgreSQL
without introducing a paid or separately hosted CMS. Editors create, edit,
validate, preview, publish and unpublish pages from `/cms`; authorized agents
perform the same operations through a separate MCP endpoint.

This is an internal publishing tool for two people, not a general-purpose CMS.
Each page keeps a small, bounded set of stored copies — one shared working copy,
a 24-hour checkpoint, the shareable preview snapshot, and the current
publication plus three previous ones (§14). Editing never changes what a reader
sees: a save writes the working copy, and the live article keeps serving its
last publication until somebody publishes.

## 2. Architectural direction

Factura is expected to become two deployments later:

1. `factura.uno`: public site, public content rendering, and CMS.
2. `app.factura.uno`: authenticated bill application currently under `/app`.

The module boundaries below exist to make that split a move rather than a rewrite.

### 2.1 Module boundaries

Use these boundaries:

```text
src/
  app/
    (cms)/
      layout.tsx                 # independent CMS root layout
      cms/                       # thin Next.js route adapters only
    api/
      cms/                       # thin HTTP/MCP route adapters only

  cms/                           # private CMS feature; portable as one module
    auth/
    components/                  # CMS-only visual components
    editor/
    mcp/
    server/
    validation/
    types.ts

  content-system/                # shared by public site and CMS
    components/                  # allowed MDX component manifest
    repository/                  # content read contracts + implementations
    validation/                  # pure validators, no UI and no filesystem
    metadata/
    types.ts

  content/                       # existing filesystem content during migration
  components/                    # existing public-site components
  db/                            # temporarily shared database connection/schema
```

`src/app/(cms)/cms/**` and `src/app/api/cms/**` are transport layers. Business
rules must live in `src/cms` or `src/content-system`, not in route files.

### 2.2 Dependency rules

- `src/cms/**` must not import from `src/components/app/**`, app routers, bill
  domain code, parser code, insights, properties, or other `/app` features.
- CMS visual components live under `src/cms/components/**`. Do not reuse the app
  shell or app navigation.
- CMS code may use shared fonts, global design tokens, Auth.js identity, the
  database connection, and pure utilities that do not belong to the bill app.
- Public content rendering must not import CMS UI or CMS mutations.
- `src/content-system/**` must not import from `src/cms/**`.
- Both the browser CMS and CMS MCP must call the same server-side CMS service.
  The MCP must not be a second direct database implementation.
- The existing user-facing `/api/mcp` stays read-only and must not acquire CMS
  tools or CMS scopes.
- New CMS tables and enums use a `cms_` prefix so they can be identified and
  moved to another database later.
- Use `bun` for package management and commands.

### 2.3 Shared dependencies

These are intentionally shared with the bill application for now (Task 9 separates them):

- Auth.js session and user identity.
- PostgreSQL connection and Drizzle schema.
- Public article layouts and public content components.
- Global fonts/tokens where useful.

All CMS authorization must go through a small adapter (`src/cms/auth`) so a
future deployment can replace shared Auth.js/database access without rewriting
CMS pages or services.

## 3. Content decisions

### 3.1 Content scope

All three MDX sections live in the database: `/guias`, `/estadisticas` and
`/investigaciones`. `/normativa` is a hand-built registry page rather than
authored content and is not part of this.

The repository `.mdx` sources are gone. The database is the only source of
editorial content, and there is no filesystem fallback behind it.

### 3.2 Lifecycle

Each page has exactly one of these states:

| Status      | CMS     | Direct public URL                 | Search/list discovery |
| ----------- | ------- | --------------------------------- | --------------------- |
| `draft`     | visible | 404                               | excluded              |
| `preview`   | visible | rendered with `noindex, nofollow` | excluded              |
| `published` | visible | rendered normally                 | included              |

Rules:

- `draft` is allowed to be incomplete.
- A transition to `preview` requires safe, parseable content and valid required
  metadata.
- A transition to `published` requires the complete document and collection
  validation suite.
- Saving an existing `published` page is allowed only if the resulting page
  passes publish-level validation.
- Unpublishing changes `published` to `draft` and expires the section's public
  cache tag, so the page stops being served on the next request — see §3.3.
- A private `/cms/preview/[id]` route always renders the latest saved version
  immediately and is never cached. This is the reliable editing preview.
- A public `preview` URL is intentionally shareable by direct URL but is not a
  security boundary. Do not put secrets or private material in it.

### 3.3 Caching

- Public database queries use the current Next.js 16 caching model for this
  project (`cacheComponents` is not enabled).
- Wrap non-`fetch` database reads with `unstable_cache` and use a statically
  analyzable `revalidate: 3600` value.
- Existing generated slugs may be returned from `generateStaticParams`.
- Set `dynamicParams = true` (or omit it, which defaults to `true`) so a newly
  created database slug can render on demand instead of returning a permanent
  build-time 404.
- CMS pages and private CMS previews are dynamic and uncached.
- Every cached public read carries its section's tag, `content:<section>`
  (`src/content-system/repository/tags.ts`). A route inherits the tags of the
  cached reads it ran, so one tag reaches the article, the section index, the
  category hubs, the related rail, the sitemap, the feed, `llms.txt` — and the
  cached 404 of a path that had no page until now.
- The CMS expires that tag when, and only when, a write changes something a
  public visitor can see. Since §14 that is a shorter list than it was: a save
  writes a `wip` revision no public pointer can reach, so **no save expires
  anything, in any status**. What does: publishing, promoting or refreshing the
  public preview, unpublishing, and returning a preview to draft.
- Invalidation is `revalidateTag(tag, { expire: 0 })`, from the content service
  rather than from either transport — `updateTag` is Server-Action-only and the
  CMS MCP is a Route Handler. Immediate expiry rather than the `"max"` profile:
  unpublishing has to actually take the page down, and stale-while-revalidate
  would serve the withdrawn copy to the visitor whose request triggered the
  refresh.
- The TTL stays as the floor, for the case where invalidation does not run.
  A failed invalidation is logged and never fails the write it follows: the row
  is already committed, and the fallback is the hour that used to be the only
  mechanism.

### 3.4 Editor

Use a GitHub-like source workflow, not WYSIWYG:

```text
[ Markdown ] [ Preview ] [ Validation ]
```

- Use CodeMirror 6 for Markdown/MDX source editing.
- Provide line numbers, search, Markdown syntax highlighting, tag/bracket
  matching, and a lint gutter.
- Custom components stay visible as source, for example `<TrustBlock />`.
- Server validation returns line/column diagnostics that the editor displays.
- Preview renders only the last successfully saved database value.
- Explicit Save only; there is no autosave. Editing a published page edits the
  live copy, and a save that happened because someone paused typing is not a
  decision anyone made.
- Warn before navigating away with unsaved changes.
- Component autocomplete and property suggestions are Task 7.

### 3.5 Restricted MDX

Database content is a constrained MDX dialect, not executable JavaScript.

Allowed:

- Markdown headings, paragraphs, emphasis, lists, links, block quotes, tables,
  images, and code blocks supported by the existing renderer.
- Registered custom components.
- Literal, schema-validated component properties.
- Markdown children only for components whose manifest allows children.

Rejected:

- `import` and `export` declarations.
- JavaScript expressions and statements.
- Functions and event handlers.
- Spread attributes.
- Inline scripts.
- Unknown custom components.
- Unknown properties or invalid property values.
- A component used in a content section where it is not allowed.

Do not silently strip forbidden syntax. Reject it with a line/column error that
explains how to use a registered component. Drafts may be saved with ordinary
editorial validation errors, but forbidden executable constructs must never be
compiled or previewed.

### 3.6 Component manifest

Create one typed manifest that controls rendering and authoring:

```ts
type ContentComponentDefinition = {
  component: React.ComponentType<unknown>;
  sections: readonly ContentSection[];
  kind: "leaf" | "container";
  props: z.ZodType;
  description: string;
};
```

The manifest is the source of truth for:

- Runtime component resolution.
- Allowed names and sections.
- Property validation.
- Whether children are accepted.
- CMS component help/documentation.
- Future editor autocomplete.
- MCP tool instructions.

The guide components are:

- `ClosingCta`
- `Faq`
- `InflacionChart`
- `ProbarCta`
- `RelatedGuides`
- `TrustBlock`
- Any other currently supported guide component discovered by the migration
  audit before implementation begins.

`InflacionChart` currently appears through local imports in guide MDX. Register
it centrally and remove those imports from the database body during migration.

### 3.7 Metadata storage

Do not store `export const meta` in database MDX. Store metadata as typed data.

Use dedicated columns for identity, lifecycle, and commonly queried values:

- `section`
- `slug`
- `status`
- `title`
- `title_tag`
- `description`
- `summary`
- `cta`
- `canonical_slug`
- `published_at`
- `content_updated_at`

Use validated JSONB for structured or optional guide metadata:

- `keywords`
- `categories`
- `faq`
- `og_title`
- `og_description`
- `og_image`
- `vendor`
- `preview_media_id` (§9.2)

The CMS presents normal fields and controls; editors never edit raw metadata
JSON. Define one Zod schema shared by forms, mutations, MCP tools, migration,
validation, and public rendering.

## 4. Data model

The tables as built. Names follow the project's singular convention
(`cms_member`, not `cms_members`); the Drizzle exports are plural.

### 4.1 `cms_members`

```text
user_id       uuid primary key, FK users.id
role          cms_role not null       # admin | editor
created_at    timestamptz not null
created_by    uuid nullable, FK users.id
```

- Membership is an explicit allowlist, separate from property `owner/member`
  roles and separate from ordinary user profile data.
- Initial membership is inserted manually in the database.
- Both roles may author. Only `admin` may manage CMS API tokens.
- Whether only admins may publish is a policy toggle in the authorization
  service (`canPublish`); today both roles may publish and unpublish.

### 4.2 `cms_pages`

```text
id                    uuid primary key
section               text not null              # guias | estadisticas | investigaciones
slug                  text not null
status                cms_page_status not null   # draft | preview | published
body_mdx              text not null
title                 text not null
title_tag             text nullable
description           text not null
summary               text not null
cta                   text not null
canonical_slug        text nullable
metadata              jsonb not null
parent_id             uuid nullable, FK cms_pages.id (restrict)
sort_order            integer not null default 0
crumb                 text nullable
lock_version          integer not null default 1
created_by            uuid not null, FK users.id
updated_by            uuid not null, FK users.id
created_at            timestamptz not null
updated_at             timestamptz not null
published_at          timestamptz nullable
content_updated_at    timestamptz not null
unique(section, slug)
```

`parent_id`, `sort_order` and `crumb` are the universal hierarchy (§7.1), on
every section rather than only the ones with hubs today. `slug` remains the full
path; `parent_id` is the editorial tree. `restrict` on the foreign key so a page
with children can never be removed silently — there is no hard delete at all,
so it is a guard against a later one.

`lock_version` is optimistic concurrency, not revision history. Every update
includes the version last read by the editor/agent and increments it. A mismatch
returns a conflict and never overwrites another save.

Deletion is archive-by-status, not hard delete. There is no destructive delete
action anywhere in the CMS.

### 4.3 `cms_api_tokens`

```text
id             uuid primary key
user_id        uuid not null, FK users.id
name           text not null
token_hash     text not null unique
scopes         text[] not null
expires_at     timestamptz nullable
last_used_at   timestamptz nullable
revoked_at     timestamptz nullable
created_at     timestamptz not null
```

- Show the plaintext token only once at creation.
- Store a cryptographic hash, never the token.
- Tokens remain tied to a current `cms_members` row; removing membership
  immediately removes authority even if the token has not been revoked.
- Scopes: `cms:read` and `cms:write`.
- Publishing requires `cms:write` plus the same role policy as the browser.

## 5. Validation architecture

Refactor existing validation into pure functions without losing the CLI checks.

### 5.1 Layers

1. **Security/grammar validation**
   - Parse MDX into an AST without evaluating it.
   - Reject ESM, expressions, scripts, spreads, and unknown JSX.
   - Validate component names, properties, children, and section restrictions.

2. **Document validation**
   - Validate metadata schema, dates, slug, title/description limits, required
     components, headings, links, FAQ placement, CTA conventions, and word
     count/read time.

3. **Collection validation**
   - Validate unique slugs, duplicate/cannibalizing titles and descriptions,
     canonical targets, links to missing/non-published pages, categories, and
     other cross-document rules.

4. **Render validation**
   - Compile/render only after grammar validation succeeds.
   - Verify the exact public component registry can render the page.

### 5.2 Adapter model

Expose pure entry points similar to:

```ts
validateContentDocument(document, index, level);
validateContentCollection(documents);
buildContentIndex(documents);
```

Keep an adapter for:

```ts
documentsFromDatabase(); // CMS and public site
```

After cutover, content validation belongs to the CMS publication workflow. CI
must not validate or snapshot the production corpus. Its production build uses
one deterministic in-memory fixture per section so rendering and discovery are
still exercised without database access or editorial coupling.

### 5.3 Save/transition policy

- Save: grammar only, **whatever state the page is in**. A save writes the
  working copy, which no reader can reach, so holding it to the rules a public
  page must meet would only stop an editor saving half-finished work on an
  article that happens to be live. `WIP_VALIDATION_LEVEL` is a constant rather
  than a function of status, because "it does not depend on the status" is the
  property worth making unmistakable.
- Security errors: store only if the implementation can guarantee the body is
  never compiled; preferred behavior is to reject the save and preserve the
  previous saved value.
- Promote to public preview: requires grammar and document validation with no
  errors — the URL is shareable, so it has to be a real page.
- Publish: requires grammar, document, collection, and render validation with
  no errors. Collection validation measures the candidate as the page's
  prospective _public_ document while every other page contributes what it is
  currently serving.
- Unpublish and return-to-draft: never gated. Taking a page down is the
  recovery action, and gating it on the page being valid would mean the pages
  most in need of it are the ones that cannot be taken down.
- Warnings never disappear silently; show them in the Validation tab. They do
  not block publication unless an existing validator currently treats that
  condition as an error.

## 6. Public content repository

Introduce a repository contract before changing routes:

```ts
interface ContentRepository {
  getByPath(
    section: ContentSection,
    slug: string[],
  ): Promise<ContentDocument | null>;
  listPublished(section: ContentSection): Promise<ContentSummary[]>;
  listPubliclyRenderable(section: ContentSection): Promise<ContentSummary[]>;
}
```

Semantics:

- `listPublished` returns only `published` content for lists, sitemap, feed,
  `llms.txt`, related guides, categories, and IndexNow.
- `getByPath` may return `preview` so a direct public preview URL can render it
  with `noindex`; it never returns `draft` to a public caller.
- CMS repositories expose separate authenticated methods and may return every
  state.
- Public pages never infer visibility themselves; the repository/service owns
  the rule.

During migration, use a composite repository:

- Guides: PostgreSQL after cutover.
- Statistics/research: existing filesystem registries.
- Normativa: unchanged.

## 7. CMS browser surface

Routes, scoped by section:

```text
/cms                            section index
/cms/[section]                  that section's content list
/cms/[section]/new              create a page in that section
/cms/[section]/[id]             metadata + Markdown editor
/cms/[section]/preview/[id]     exact private saved preview
/cms/tokens                     CMS MCP token management (admin only)
```

`[section]` is the `cms_page.section` value, and it mirrors the **public** path:
`/cms/investigaciones` edits what readers see at `/investigaciones`. An editor
never has to hold two names for one section in their head, and no route file
translates between them, because there is only one name.

Research once shipped as `investigacion` in the column while its URLs were
already plural, and `src/cms/sections.ts` carried a segment↔id mapping to bridge
the two. Both the column value and the mapping are gone: a section id is plural,
which makes it the URL segment as well.

Why sections get their own URLs rather than one filtered list: one combined list
would need a section filter on every query, a form that changes shape per row,
and a component palette that depends on the selected item. The URL is also a
better home for "which section am I in" than component state — it is
bookmarkable and it scopes the data fetch.

These are **one dynamic route set**, not a directory per section. The section
registry (`src/cms/sections.ts`) drives the routes, the navigation and the
`/cms` index, so adding a section later — `noticias`, say — is a registry entry
plus its metadata schema and component registrations, not four more route files
and a fourth copy of the editor.

`/cms/[section]/preview/[id]` is a sibling of the editor, not a child of it.
The preview renders in the _article_ shell with no CMS chrome, which a
route nested under the editor would inherit.

A section may be registered as `planned`: it appears on `/cms` so editors can
see what is coming, but `/cms/[section]` 404s rather than opening a half-built
editor. All three sections are `live` today; the status exists for the next one.

`/cms/tokens` stays top-level — it is not scoped to a section. Note that
`tokens`, `new` and `preview` are therefore reserved segments and cannot be
section ids or page ids; page ids are UUIDs, so no collision is possible.

### 7.1 Sections differ in data, never in branches

Sections are separated in the URL and unified in the model. Anything that
differs between them is an entry in the section registry, the component manifest
or a metadata schema — never `if (section === "estadisticas")` in a list, an
editor, a breadcrumb, a sitemap or a validator.

The rule this follows from: **when one section has a capability and the others
do not, that is usually because it needed it first, not because the others never
will.** A guides hub with children is a matter of when, not whether; news will
want one on day one. So the capability is built once, uniformly, and a section
that does not use it simply has every page at the top level.

How that applies:

- **Hierarchy is universal.** Every page in every section has `parent_id`,
  `sort_order` and `crumb`. Statistics needed a second level first
  (`/estadisticas/inflacion-de-vivienda` and its six regions); guides get the
  same model and happen to sit flat today. `src/content-system/hierarchy.ts`
  holds the rules, and the CMS list, breadcrumbs and indexes build from
  `buildContentTree` for all sections.
- **Two representations, one invariant.** `slug` stores the full materialised
  path, so a public read stays one indexed equality lookup rather than a
  recursive walk; `parent_id` carries the editorial tree an author reorders.
  The invariant — a child's slug is its parent's slug plus one segment — is
  checked in `checkHierarchy` on every create and every update, so they cannot
  drift.
- **The tree's rules are enforced once:** no cross-section parent, no cycle, no
  page parented to itself, and no nested path without a parent row. That last
  one is the "every intermediate path exists" invariant, applied to all three
  sections rather than the two with hubs today.
- **Section metadata schemas** are registry entries, so the shared form renders
  the right fields without a conditional.
- **Component availability** is already data: the manifest's `sections` field
  per component (§3.6).

Section 12's job therefore shrinks to registering statistics' and research'
metadata schemas and components and flipping their registry status to `live` —
not building a second editor.

Required behavior:

- `/cms` is excluded from the locale proxy rewrite.
- `(cms)` has an independent root layout with private/noindex metadata.
- Anonymous users are redirected to `/login` with a safe callback URL.
- Signed-in non-members receive 404 or a plain forbidden screen; do not reveal
  editor data.
- CMS navigation and layout use only `src/cms/components`.
- `/cms` lists the registered sections; a `planned` one is shown but not
  linked.
- `/cms/[section]` 404s for an unknown or not-yet-editable section, with the
  same response for both — there is nothing to edit either way.
- An editor URL whose `[section]` does not match the stored row's section is a
  404, so a page cannot be opened under the wrong section's form.
- Section-specific behaviour (metadata fields, component palette, list columns)
  comes from the registry; the list and editor components themselves are shared.
- Content list filters by status and searches title/slug.
- List shows title, slug, status, last editor, and last update.
- Editor has separately validated metadata fields and Markdown body.
- Save uses optimistic concurrency and reports conflicts clearly.
- Status transitions require confirmation and show validation failures inline.
- Open Preview opens a new tab and renders the last saved value.
- Published-page edits show the one-hour propagation warning.
- There is no hard-delete button.

## 8. CMS MCP surface

Create `/api/cms/mcp` as a separate stateless protected resource. Reuse the
existing MCP protocol primitives where appropriate, but keep configuration,
instructions, auth, scopes, tools, and tests under `src/cms/mcp`.

Tools:

```text
list_content
get_content
create_content
update_content
validate_content
set_content_status
```

Tool rules:

- `create_content` creates `draft` content by default.
- `update_content` requires `id` and `expectedLockVersion`.
- `set_content_status` performs the same validation and authorization as the
  browser service.
- Tools return structured validation diagnostics, not only prose.
- `get_content` returns metadata, body, status, and lock version.
- List/get require `cms:read`; mutations require `cms:write`.
- Every tool re-checks active CMS membership and token status.
- Log mutation actor, page id, operation, result, and timestamp without logging
  token values or full content bodies.
- Rate-limit the endpoint.
- Do not advertise CMS tools through the ordinary Factura MCP endpoint.
- Do not add automatic publication. Agents must explicitly request a status
  transition, and publication must pass the publish gate.

## 9. Media library

Images are rows in PostgreSQL and objects in a bucket, not files in the
repository. The library lives at `/cms/media`, is written only through
`CmsMediaService`, and is read by the public site through a small contract in
`src/content-system/media`.

The rule underneath everything here: **nothing deletes bytes automatically, and
nothing trusts the browser.** Every subsection below is one of those two
sentences applied to a specific mechanism.

### 9.1 Three values, never collapsed

Every image gets an opaque UUID in `cms_media.id`, generated once and derived
from nothing. A hash is useful for spotting duplicates but it is not identity:
uploading the same pixels twice may be deliberate, and editing alt text must not
change an image's address.

| Value               | Example                                       | Stored where                 | Purpose                                     |
| ------------------- | --------------------------------------------- | ---------------------------- | ------------------------------------------- |
| Media id            | `8f…c2`                                       | PostgreSQL and page metadata | Stable relational identity                  |
| Editorial permalink | `/media/8f…c2/medidor-de-luz.jpg`             | MDX body                     | Portable, human-readable reference          |
| Object origin       | `https://media.factura.uno/cms-media/8f…c2/…` | Derived from configuration   | Where `next/image` fetches the source bytes |

Resolution is by UUID; the filename in a permalink is descriptive only, so
renaming an image's library title never breaks an article. Moving from R2 to S3
or another CDN changes `CMS_MEDIA_PUBLIC_ORIGIN`, not every page.

The permalink's trailing extension is mandatory rather than cosmetic.
`src/proxy.ts` rewrites everything it matches into the `/es` tree and excludes
anything containing a dot, so an extensionless permalink would become
`/es/media/…` and 404. The route is excluded by name too, but content that
always carries an extension keeps this working even if that list changes.

Storage URLs never appear in content: not `r2.cloudflarestorage.com`, not
`pub-….r2.dev`, not presigned URLs with credentials in the query string, not
bucket names or object keys.

### 9.2 Where media is referenced

Two authoring cases with two data shapes:

**Preview image** is structured page metadata: `previewMediaId`, a uuid, in the
section's JSONB. The editor renders it as a picker, not a text field, and
listing reads batch-resolve the selected records so a page of twenty guides
costs one query rather than twenty. Both metadata schemas
(`content-system/metadata/guias.ts` and `sections.ts`) validate it, and it
reaches the UI as a typed `MediaRef` through `SectionMeta.previewMediaId`.

**In-text image** stays ordinary Markdown:

```md
![Medidor digital con una lectura de 184 kWh](/media/8f…c2/medidor-de-luz.jpg)
```

That keeps bodies readable and lets the grammar validator keep treating images
as Markdown rather than components. The custom `img` renderer recognizes only
Factura permalinks, resolves the UUID, and renders the shared `MediaImage`.

External image URLs in a body are a validation error. An editor imports the
image into the library first — remote content changes without notice, can carry
a tracking pixel, and breaks when the other site reorganizes.

### 9.3 Alt text belongs to a use, with a library default

Alt describes what an image means _here_; it is not a property of the file. The
row stores `default_alt` as an editable suggestion, and the real alt lives in
the Markdown. Insertion pre-fills from the default and lets the editor change it.

An image can be marked decorative in the library, which empties the default and
inserts `![](…)`. **Blank alt without the decorative flag is a validation
error** — a screen reader cannot tell an intentional decoration from a
forgotten description, so the claim has to be made on purpose.

Preview thumbnails always render `alt=""`: the title sits right beside them, and
repeating it is worse accessibility, not better.

### 9.4 Storage: a separate bucket, immutable masters

CMS media has its own bucket and its own credentials, not another prefix in the
bill-PDF bucket. `CMS_MEDIA_S3_BUCKET` and `CMS_MEDIA_PUBLIC_ORIGIN` are
required; endpoint, region, keys and path-style fall back to the existing `S3_*`
values, because the connection is normally the same account and making a
deployment state it twice only lets the two drift.

The bucket is the part with no fallback, and the reason is worth stating because
"another prefix" is the obvious guess:

> These objects must be publicly readable, because the Next.js image optimizer
> fetches a remote source without forwarding credentials. On R2, public access
> is a **per-bucket** switch. There is no per-prefix public setting.

Sharing a bucket with `bills/` would therefore mean publishing every stored
utility bill. Bill PDFs are read exclusively through presigned GETs
(`src/server/storage.ts`), and that has to keep being true — which is why the
CMS boundary test forbids importing that module.

Two key namespaces, and the split is what lets immutability and EXIF stripping
both hold:

```text
cms-media/_incoming/<reservation-id>                    # staging, disposable
cms-media/<media-id>/<sha256-prefix>.<canonical-ext>    # master, immutable
```

A browser that uploaded straight to the final key could not also have its EXIF
stripped, because stripping changes the bytes and the key was already written —
and the stored hash would then describe bytes nobody serves. So the browser
writes staging, and the server writes the master from bytes it has inspected.

**Bytes at a master key are never replaced.** There is no "replace file"
operation: upload a new asset and move the references. Immutability is what
makes a long optimizer cache free, makes a hash mismatch meaningful, and means
two rows with identical bytes are two objects — deleting one can never orphan
the other. `sha256` is a duplicate _warning_ at upload time and nothing more.

### 9.5 Upload contract

Direct-to-storage, so image size is not capped by a Route Handler body limit:

1. The browser asks a same-origin CMS route for a reservation — name, claimed
   type, byte size, target collection.
2. The service authorizes the member, applies the limits below, **commits a
   `pending` `cms_media` row**, and only then returns a presigned `PUT`. The row
   exists before the URL does, so the bucket can never hold a key PostgreSQL has
   not recorded.
3. The browser uploads to the staging key and reports progress. A bad file fails
   its own row without cancelling the batch.
4. The browser calls finalize. The service reads the staged object, sniffs the
   file signature, decodes dimensions, normalizes orientation, strips GPS and
   other metadata, writes the master, hashes **the master**, deletes staging,
   and flips the row to `ready`.
5. Rows still `pending` past the reservation lifetime are swept by
   `scripts/mediaSweep.ts`; the bucket's `_incoming/` expiry rule is the backstop
   if that sweep never runs.

Validation trusts magic bytes and a successful decode, never the extension or
the browser's `Content-Type` — those are hints used to fail early and cheaply.
It rejects polyglots, truncated files, dimension bombs and zero-sized images.
Guardrails are configuration-backed, defaulting to 20 MB per image, 20 images
per batch, 40 megapixels after orientation, and a 15-minute reservation.

Supported formats are JPEG, PNG, WebP, AVIF and GIF. **SVG is deliberately
absent**: it can carry scripts and external references, and a vector file gains
nothing from raster optimization. It becomes possible later with a real
sanitizer, a restrictive CSP, `unoptimized` and its own tests — not by adding a
line to the list. TIFF/BMP/HEIC are import formats, not delivery formats.

### 9.6 Data model

Three `cms_`-prefixed tables, so they move with the CMS when the deployments
split:

| Table                  | Holds                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `cms_media`            | One row per image: status, collection, filenames, MIME, bytes, dimensions, sha256, alt |
| `cms_media_collection` | A flat named group; `cms_media.collection_id` is nullable and `set null` on delete     |
| `cms_media_usage`      | Which page uses which image, in which placement, how many times                        |

`cms_media.status` is the whole lifecycle:

```text
pending ──finalize──▶ ready ──trash──▶ trashed ──purge──▶ purging ─▶ purged
                         ◀──restore──┘
```

`cms_media_usage` is keyed `(page_id, media_id, placement)` — one row per
placement carrying a count, not one row per occurrence. The question it answers
is boolean ("may this be trashed?"), and an image used twice in one body is one
row with `occurrences = 2`, which is also the only shape a composite unique
constraint can express without inventing an ordinal.

### 9.7 Usage is a cache of a pure function

The incremental write on every page save is an optimization. **The definition is
that usage is a pure function of the current `cms_page` rows**, and two things
follow:

- a table maintained only incrementally can never be fully trusted, because a
  bug in the maintenance path leaves permanent, invisible drift; and
- pages that existed before the library did have no usage rows at all until
  something re-derives them.

So `reconcileMediaUsage()` is a first-class operation, not a recovery script,
and it runs the _same_ extractor as the incremental path — one implementation,
so the two cannot disagree about what a reference is. It is available from the
library's «Recalcular» button and runs as the first step of every purge sweep.

Extraction is deliberately generous, because **a missed reference is the
dangerous direction**: an image whose use is not found looks unused, is offered
for cleanup, and eventually loses its bytes while a live page still points at
it. A false positive merely keeps a file alive slightly too long. So it reads
the parsed tree rather than running a regex over the source, and counts every
construct that can carry a URL — Markdown images, reference-style images, links
_to_ an image, and JSX string attributes.

Publish-level validation rejects unknown, trashed and purged ids, and in-text
images with no alt that were not declared decorative. All are errors rather than
warnings, because each one reaches a reader.

This model depends on page history being events rather than body snapshots
(`cms_page_event`), so current bodies really are the complete set of references.
If history ever grows snapshots, an old revision would hold references nothing
counts, and this needs revisiting.

### 9.8 Collections are flat and never touch the object key

Editors want folders; collections are that, as pure database metadata.

- **Never encode a collection in the object key.** Moving an image between
  collections would otherwise move bytes, breaking the immutability §9.4 and
  §9.11 both depend on.
- **Single-parent, not many-to-many.** One nullable column: "which collection is
  this in" has one answer, the UI is a select, and every listing stays a plain
  join. Promoting it to a join table later is a backfill, not a trap.
- **Flat, not nested.** At this size a tree is furniture; «Guías · Edesur»
  carries the same information as two levels of clicking.
- **Deleting a collection never deletes media.** It nulls the column and the
  images reappear under «Sin colección».

### 9.9 The trash is the only path out

Three rules, and they are why this subsection is short:

1. **Removing an image from a page never deletes anything.** The save rewrites
   that page's usage rows and does nothing else. The asset stays and surfaces
   under «Ya no se usan», where a human decides.
2. **Only a person, in the browser, can trash or purge.** There is no MCP tool
   that destroys media — the same contract the CMS MCP already states for pages.
3. **Trashing requires zero references.** The dialog lists the pages and
   placements and links to each editor.

Trashing is one `UPDATE`; no bytes move, and «Restaurar» works at any time
before the purge. Purging happens when the 30-day grace period elapses or an
editor explicitly chooses «Eliminar definitivamente», and either way it runs the
same sequence: re-check usage **in the same transaction that claims the row** —
restoring the asset if a reference appeared while it sat in the trash — then
mark `purging`, delete the object idempotently, and mark `purged` with a
tombstone. A row stuck in `purging` because storage was unavailable is retried
by the next run. The permalink returns `410 Gone` from `trashed` onward.

That re-check is what makes concurrent edits safe without row locking. The
dangerous interleaving — one editor trashes an unused image while another
inserts it into a page — resolves thirty days later in favour of the page. There
is no window in which a live page points at bytes that are already gone.

The grace period also replaces something this design quietly took away. While
these images lived in git, a mistaken deletion was a `git revert`; once the
bytes are only in a bucket, the trash _is_ that safety net.

Purging removes the source object and future rendering. Previously generated
optimizer and CDN variants can survive until their TTL expires — media is public
editorial content, so that window is documented rather than coupling the
portable storage layer to one provider's purge API.

### 9.10 Library views

`/cms/media` is dynamic and uncached: a thumbnail grid with name, dimensions,
format, size, alt status, collection, usage count and upload date, plus a
sidebar of collections and virtual views that need no schema of their own.

| View              | Query                                         |
| ----------------- | --------------------------------------------- |
| Todas             | `status = 'ready'`                            |
| Sin colección     | `collection_id is null`                       |
| **Nunca usadas**  | no usage rows and `first_used_at is null`     |
| **Ya no se usan** | no usage rows and `first_used_at is not null` |
| Papelera          | `status = 'trashed'`, with days remaining     |

Splitting "unused" in two is the point of the feature. An image uploaded five
minutes ago and one dropped from a guide last month both have zero references,
but only the second is obviously safe to remove — and it is the case that
motivates the library, since a replaced image is exactly what would otherwise
sit in the bucket forever.

Draft and preview pages count as usage, and the row says so, so a blocked trash
action is never mysterious.

**Never list the bucket to build this screen.** PostgreSQL is the catalog; the
bucket is bytes. That rule is about rendering, not auditing: a separate
reconciliation does exactly what the grid must not — one `ListObjectsV2` diffed
against `cms_media`, reported as orphaned objects and rows without objects. It
is the only check that can catch a bug in the purge path rather than assuming it
worked, and it is paired with the usage rebuild from §9.7 in
`scripts/mediaSweep.ts`.

### 9.11 Rendering

`MediaImage` is the one component that renders a library image, on the public
site and in the CMS preview alike, so the things easy to get wrong per call site
are decided once: resolved origin, intrinsic dimensions from the database (which
is what lets `next/image` reserve the aspect ratio), decorative behaviour,
per-placement `sizes`, and lazy loading by default.

`next.config.ts` carries one narrow `images.remotePatterns` entry built from
`CMS_MEDIA_PUBLIC_ORIGIN` — exact protocol, hostname, port and `/cms-media/**`
path. A wildcard Cloudflare hostname would make every bucket in the account a
valid source for this site's optimizer, which is a way of paying to resize other
people's images. Because masters are immutable, `minimumCacheTTL` is set high:
the bytes behind a URL can never change, and a replaced image is a new id and a
new URL.

Animated GIFs, and any asset approaching the megapixel ceiling, are served
`unoptimized`. That is not author-controlled: optimizing a GIF's first frame
would change the asset, and a 40 MP master should be served as-is rather than
making every cold cache pay for a slow transform.

An id that does not resolve is a validation failure that reached the database —
a purged asset, or a hand-edited body. The public page shows a quiet gap rather
than crashing, and says enough for whoever opens the CMS to find it.

Alt-text edits need no image-cache invalidation: alt lives in page HTML, so
saving a published page uses the existing section tag expiry.

`default_alt` is Spanish, like the rest of the content. When English routes
arrive, alt becomes per-locale — a second column and an override at the point of
use, not a redesign.

### 9.12 Boundaries and the public read contract

```text
src/cms/media/
  components/          # drop zone, grid, detail, picker
  server/
    service.ts         # transport-independent rules and authorization
    store.ts           # cms_media, cms_media_collection, cms_media_usage
    storage.ts         # S3-compatible adapter
    uploads.ts         # reservation, finalization, image processing
    usage.ts           # extraction + reconcileMediaUsage()
    purge.ts           # trash sweep, bucket reconciliation
  validation/
  types.ts
```

Routes under `src/app/(cms)/cms/media/**` and `src/app/api/cms/media/**` stay
thin. The public site never imports any of it: it reads media through
`src/content-system/media`, which returns a typed `MediaRef` and resolves ids in
one batch per document rather than one query per image.

The content service records usage through an **injected** port rather than
importing the media store, so the page half of the CMS does not depend on the
media half — and a test can write pages without a media library at all.

### 9.13 MCP surface

The media tools use the same reservation flow as the browser, because MCP has no
portable way to attach a file to a tool call:

```text
list_media               cms:read     catalog records and stable permalinks
get_media                cms:read     metadata and usage for one asset
create_media_upload      cms:write    reserve an upload, return a presigned PUT
complete_media_upload    cms:write    validate the bytes, finish the record
update_media             cms:write    alt, decorative, name, collection, attribution
```

An agent calls `create_media_upload`, `PUT`s its local file to the returned URL,
then calls `complete_media_upload` — which works for capable agents without
pushing binary through the model context. Upload URLs are secrets until they
expire and must never reach article content, logs or media metadata.

**No destructive media tool exists, deliberately and permanently.** Media
follows pages rather than carving out an exception: an agent that wants an image
gone leaves it unused, where §9.10's «Ya no se usan» view surfaces it for a
person to trash.

Media mutations call the same `CmsMediaService` as browser actions, with the
same membership adapter, token scopes, rate-limit bucket, optimistic concurrency
and audit conventions. Trash, restore and purge live on that service too, but
are reachable only from the browser transport.

## 10. State of the build

### 10.1 What was built

All of it, across phases 0–12 on the `cms` branch, then reviewed and fixed
before the merge gate. In one place, so nobody has to reconstruct it from the
commit log:

| Area               | What exists                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema             | `cms_member`, `cms_page`, `cms_page_revision`, `cms_page_event`, `cms_api_token`, `cms_audit_log`, the media tables, plus the `cms_role` and `cms_page_status` enums. Additive; nothing outside the CMS reads them. |
| Authorization      | `src/cms/auth` — one gate (`requireCmsMember`), pure rules beside it (`policy.ts`), membership as an explicit allowlist with no self-service path.                                                                  |
| Content service    | `src/cms/server/contentService.ts` — the single writer. Authority, validation level, optimistic concurrency and timestamps all decided here; the store only runs SQL.                                               |
| Restricted MDX     | Allowlist grammar validation (`validation/grammar.ts`) with compilation gated on it. No bypass flag.                                                                                                                |
| Component manifest | `content-system/components` — rules split from bindings so validation tools need no React. 67 components: 10 available to guides, 59 to statistics, 57 to research.                                                 |
| Validation         | Four pure layers (grammar, document, collection, render) with per-level policy, shared by the CMS and the MCP.                                                                                                      |
| Repository         | `ContentRepository` with the lifecycle rules in one module (`repository/visibility.ts`); cached public read models for guides and for the registry sections.                                                        |
| CMS surface        | `/cms`, `/cms/[section]`, `/cms/[section]/new`, `/cms/[section]/[id]`, `/cms/[section]/preview/[id]`, `/cms/tokens` — one dynamic route set driven by a section registry.                                           |
| Editor             | CodeMirror 6 source editing, section-driven metadata form, Markdown/preview/validation tabs, explicit save, conflict recovery that preserves the losing text.                                                       |
| CMS MCP            | `/api/cms/mcp` with six tools over the same service, scoped tokens, membership re-checked per call, its own rate-limit bucket, metadata-only audit rows.                                                            |
| Importers          | Idempotent, local-first, refuse production without an explicit flag and a confirmation variable, validate before writing.                                                                                           |
| Media library      | `cms_media`, `cms_media_collection`, `cms_media_usage`, a separate public bucket, `/cms/media`, five MCP tools and a housekeeping sweep. Design reference in §9.                                                    |

Hierarchy (`parent_id`, `sort_order`, `crumb`) is universal across sections
rather than a statistics feature, and the section registry drives routes,
navigation and forms — so adding a section is a registry entry plus a metadata
schema, not another editor.

CI also builds one deterministic fixture per content section and checks those
pages across the sitemap, feed and `llms.txt`; editorial content is validated
by the CMS rather than this repository.

### 10.2 What was not done

Honest gaps, not oversights that were papered over. Each is a §12 task.

- **There is no rollback switch.** No section falls back to the filesystem any
  more; the `.mdx` sources are gone. Rollback is restoring rows, or redeploying
  the previous build if the schema itself is what broke — which is why §11 says
  to back up before any production schema change.
- **Browser mutations are not audited.** `cms_audit_log` records MCP writes
  only, so the trail answers "what did the agent do" and not "who did what,
  including the failed attempts". The narrower question — who changed this page
  and when — is answered by `cms_page_event` and the activity strip in the
  editor's «Historial» tab,
  written for browser and MCP writes alike. Token mints, revocations and
  refused mutations are still unrecorded from the browser. Task 3.

### 10.3 Known limitations

Accepted, and the reasons are in the sections above:

- History is bounded on purpose (§14): a working copy, a 24-hour checkpoint, the
  preview snapshot, and four publications. Saves inside a 24-hour window are
  compressed rather than kept, so "what did this say on Tuesday afternoon" has
  no answer unless Tuesday's state was published or checkpointed.
- Comparison has one baseline — the live or last publication. Two arbitrary
  versions cannot be compared.
- Publishing, promoting or refreshing the public preview, and taking a page
  down expire the section's cache tag as they happen. Saves expire nothing,
  because they change nothing a reader can see. The one-hour TTL remains only
  as the fallback for an invalidation that did not run. IndexNow is still
  submitted by hand, after deploying — Task 4.
- A page's slug cannot change after creation; there are no redirects.
- A public `preview` URL is a discoverability control, not an access control.
- The CMS and the bill app share Auth.js identity and one physical database.
- Initial CMS membership is granted by hand, in SQL. There is no path in.

## 11. Operations

- The local PostgreSQL database is the development and testing target. Use it
  freely: create tables, grant membership, import and re-import, exercise every
  lifecycle and MCP operation.
- Do not point local development, tests or agent verification at production.
  `src/cms/server/testDb.ts` refuses a non-local host, and both importers refuse
  one without an explicit flag and a confirmation variable.
- Both importers are idempotent and safe to rerun. They validate before writing.
- Back up before any production schema change. `.env.prod` points at the Neon
  **pooler**, which is right for the app and wrong for DDL: drop `-pooler` from
  the host to get the direct endpoint, and pass `prepare: false` on any
  `postgres()` client that goes through the pooled one.
- Anything that must reach production names it explicitly, through a `:prod`
  script that loads `.env.prod`. Bun auto-loads `.env.local`, so a script run
  without one silently targets the local database — which is the safe default,
  and why the importers refuse `--production` against a local host.
- CMS membership is granted by hand, in SQL. Removing the row removes authority
  on the next request, including for any API token that account minted.
- CMS API tokens are shown once, stored as a SHA-256 hash, and are write-capable
  against live content. Mint them only when something needs one.
- Do not log MDX bodies, metadata payloads, session cookies or token values.

### Cache behaviour worth knowing

`unstable_cache` entries live in `.next/cache`, which deployment platforms
restore between builds — so **a deploy does not flush them**. The CMS expires
them itself on every publicly visible write, which is what makes a publish
appear immediately; the one-hour TTL is the fallback underneath.

What that does _not_ cover is a change the CMS did not make. Repairing content
with SQL, or restoring a row by hand, leaves a rebuilt server serving the old
copy until the entry expires, because nothing called `revalidateTag`. Fix
content through `/cms` or the CMS MCP where possible; otherwise plan around the
TTL. Clear `.next/cache` when verifying locally.

## 12. Tasks

Ordered roughly by how much they are missed, not by size. Nothing here blocks
anything: the CMS runs in production without all of it.

### Task 1 — CI content boundary

Resolved with one deterministic in-memory fixture per CMS section. CI builds
and prerenders those pages and verifies they appear in `sitemap.xml`,
`feed.xml`, and `llms.txt`. Production builds use PostgreSQL and the real CMS
corpus. No editorial snapshot is committed, and publishing never requires a
repository change.

### Task 2 — Revisions and change history — done

Shipped as §14. A page holds a shared working copy, a 24-hour checkpoint, the
public preview snapshot, and the current publication plus three previous ones;
editing never changes the live article; history can preview, compare and restore
retained publications, from the browser and from the MCP alike.

What was deliberately left out, and stays out unless a real need appears:
scheduled publishing, personal drafts or branches, merge/rebase, revision
comments, named checkpoints, and arbitrary revision-to-revision comparison.
Comparison has one baseline — the live (or last) publication — on purpose: two
arbitrary versions would need a picker, a URL that survives a reload, and an
answer to "compared against what?" on every screenshot.

### Task 3 — Complete the audit trail

`cms_audit_log` exists and records MCP mutations only. Browser mutations write
to `cms_page_event` instead, which covers accepted content changes from either
caller but not token operations or refused attempts, and is scoped to one page
rather than filterable across the CMS.

- Record browser mutations through the same path.
- Cover create, update, status transition, token mint and token revoke.
- Expose a filterable history in the CMS.
- Define retention and privacy policy.

### Task 4 — On-demand cache invalidation

Done. Publication, unpublication and edits to publicly
visible pages expire the section's cache tag inside the content service, so the
next visit sees them instead of waiting out the hour. §3.3 has the rules and the
reasoning; `src/cms/server/invalidation.ts` and `invalidation.test.ts` are the
implementation and the decision matrix.

### Task 5 — Slug changes and redirects

A page's address is fixed at creation. The editor shows it read-only, because a
rename without redirects would 404 every inbound link.

- Add a `cms_redirects` table and preserve every previously published path.
- Validate redirect loops and collisions.
- Render permanent redirects from old slugs.
- Update internal links and discovery surfaces transactionally.
- Then make the slug field editable again.

### Task 6 — Media library — done

Built and shipped; the design reference is §9. Left in place rather than
renumbered so the surrounding task numbers keep meaning what they meant.

### Task 7 — A richer editor

Deliberately plain: a source editor, not a WYSIWYG.

- Component-name and property autocomplete from the manifest.
- An insert-component palette with safe templates.
- Inline documentation for components and allowed values.
- A formatting toolbar and keyboard shortcuts.
- Side-by-side source and preview.
- Evaluate MDXEditor only after proving it preserves the exact source.

### Task 8 — Publishing workflow

Both roles can do everything today; `canPublish` and `canAuthor` are the toggles
that would narrow it, and both are consulted at every call site. The
working-copy/publication split §14 introduced is the substrate the rest of this
would build on — an approval step has somewhere to hold the candidate now.

- Scheduled publishing and unpublishing.
- Review and approval roles; required second-person approval for
  agent-generated content.
- Editorial comments, assignments, bulk operations.

### Task 9 — Split the deployments

The long-term shape: `factura.uno` serving the public site and the CMS,
`app.factura.uno` serving the bill application. The module boundaries in §2 exist
so this is a move rather than a rewrite, and `src/cms/boundaries.test.ts` keeps
them true.

- Decide which deployment owns login and account identity; define shared SSO.
- Move the CMS tables into their own database.
- Replace direct `users.id` foreign keys with stable external subject ids.
- Give each deployment least-privilege credentials.
- Add cross-domain session, redirect, CORS, CSP and cookie tests.
- Separate the deployment pipelines and rollback procedures.

### Task 10 — Smaller things

- Content localisation beyond the Spanish-only model.
- Full-text search inside the CMS.
- Soft-delete and archive UI with a retention policy.
- Webhooks for external systems.
- Content analytics inside the CMS.
- Automatic link suggestions and SEO briefs.

## 13. Decisions log

Append dated decisions here when implementation evidence changes something above.
Do not silently change architecture while leaving the original text in place.

- 2026-08-18: One mutable page row, a one-hour TTL, explicit saves, restricted
  MDX, and a separate CMS MCP endpoint. Revision history, immediate
  invalidation, slug changes and media management are deferred to §12.
- 2026-08-18: `cms_page.section` is `text`, not an enum, so adding a section does
  not need an enum migration. The allowed values are a TypeScript union.
- 2026-08-18: `created_by` / `updated_by` are nullable. Accounts are hard
  deleted, and neither answer a non-null column could give is acceptable —
  cascade would delete public content with an author's account, restrict would
  make deleting that account fail forever. Content outlives its author.
- 2026-08-18: Hierarchy is universal across sections rather than a statistics
  feature. A capability one section needs first is usually one the others need
  later, and building it per section is how `if (section === "…")` gets into the
  list, the editor, the breadcrumb, the sitemap and the validator.
- 2026-08-18: The CMS URL segment mirrors the _public_ path, so
  `/cms/investigaciones` edits what readers see at `/investigaciones`.
  `src/cms/sections.ts` is the only place the segment/id mismatch is written
  down.
- 2026-08-18: A preview page is `noindex, nofollow`, stricter than the site's
  usual `noindex` (which keeps `follow: true`). A page that is not published
  also emits no canonical target.
- 2026-08-19: The row → document mapper is strict for public reads and lenient
  for the CMS. A row whose stored metadata no longer parses comes back with
  empty metadata and a `metadataError` so the list and the editor still open —
  they are the only screens from which it could be repaired — while a public
  read still refuses it rather than rendering half a page.
- 2026-08-19: Sections decide between the database and the registry
  all-or-nothing, via `migrated()`. A per-page fallback would mean unpublishing
  an imported page silently served the `.mdx` still on disk, so the lifecycle
  would stop meaning anything for exactly the pages that had been migrated.
- 2026-08-19: Metadata is parsed against its section's schema before any write,
  including a draft save. A draft may be editorially incomplete but must still
  be the right shape to store, because everything downstream assumes a row can
  be read back.
- 2026-08-19: The MCP audit insert never fails a request. `page_id` is a real
  foreign key and a stale id is the ordinary agent mistake; recording it used to
  violate the constraint inside the error handler and turn a handled tool
  failure into an HTML 500. The reference is dropped rather than the record.
- 2026-08-19: Page history (`cms_page_event`) is written by the content service,
  not by the browser actions, so an agent's edit lands in the same trail as a
  person's without a second implementation — and the row carries `source` for
  the same reason, since a token's edits share their holder's user id. The
  insert is best-effort: the mutation it describes is already committed, so
  failing the save over a missing history line would report a loss that did not
  happen. Entries the record does not reach back far enough to cover are
  reconstructed from the page's own `created_at`/`updated_at` and labelled as
  such on screen.
- 2026-08-21: The media library's design reference moved into §9 of this file
  and `cms.media.md` was deleted. One document describes the CMS. The old file
  was a plan written before the work — it described migration steps that have
  run and options that were decided — so keeping it beside a §9 that describes
  what actually shipped would have meant two answers to every question.
- 2026-08-21: Preview images are `previewMediaId` only. The legacy
  `previewImage` path, both metadata schemas' regex exceptions, the `/img/**`
  body-reference channel and the files under `public/img/**` are gone, verified
  against production first: no page carried a `previewImage`, and no rendered
  page referenced `/img/`.
- 2026-08-21: §10, the temporary production-migration checklist, was deleted
  now that the migration has run and the CMS serves production. It said to
  delete itself; leaving it would have made a finished migration look pending.
  The media library moved into the gap it left, as §9, so it sits with the other
  design-reference sections instead of after the decisions log — and §11, §12
  and §13 keep the numbers other files already cite.
- 2026-08-21: Editing stopped being publishing (§14). `cms_page` was the
  editable copy and the public copy at once, so a save of a published article
  was a change to the live site — which is why saving one had to pass the full
  publish gate, and why unfinished work could not be saved on a live page at
  all. The fix is a bounded set of stored copies per page rather than a general
  revision system: one shared working copy, a 24-hour checkpoint, the promoted
  preview snapshot, and four publications. Bounded because every retained
  version pins the images it references, and an archive nobody prunes is a media
  library nobody can clean.
- 2026-08-21: Media usage moved from pages to revisions. It is the change that
  makes retention safe: an image is protected for exactly as long as some
  retained copy references it, and released by the same cascade that prunes
  that copy. A page-keyed table could not express "the article stopped using
  this, but the version we are still keeping did not".
- 2026-08-21: `Revisión`/`Revisar` became `Validación`/`Validar`. Two meanings
  of the same word — "check this page" and "a stored copy of it" — in one
  sidebar, once versions existed.
- 2026-08-21: Comparison has one baseline, the live (or last) publication, and
  no pairwise selector. Two arbitrary versions would need a picker, a URL that
  survives a reload, and an answer to "compared against what?" on every
  screenshot; the comparison people actually want is "what would publishing
  change".
- 2026-08-21: §14 sits after this log rather than among the design-reference
  sections, which is where the media library was deliberately moved _to_. The
  difference is that §9 had a gap to fill and this does not: inserting it
  earlier would either renumber sections other files cite, or leave the file
  reading 12, 14, 13. Monotonic numbering won.
- 2026-08-22: The revision migration ran in production and its scripts were
  deleted — `cms-revisions.sql`, `backfillCmsRevisions.ts`, and the legacy
  authored columns on `cms_page` with them. `renameInvestigacionSection.ts` went
  in the same pass, having been through every environment. A one-shot script
  that has run is not documentation of the system; it is documentation of a
  moment, and keeping it invites someone to run it again. §14.10 keeps what
  survives the scripts: the shape of the data they left behind.

## 14. Working copies, revisions and version history

Editing never changes the currently published article. That one sentence is the
whole feature, and everything below is what it costs to make it true.

Before this, `cms_page` was the editable copy and the public copy at the same
time. Saving a published page _was_ the live page, which is why a save had to
pass full publish validation, why a half-finished paragraph could not be saved
at all, and why "what does the site actually say right now" and "what am I
working on" were the same question with one answer.

### 14.1 Terms

- **Page** — stable identity and public path: `id`, `section`, immutable `slug`,
  lifecycle state, and four revision pointers.
- **Working copy (WIP)** — the single mutable saved document being edited.
  Private to the CMS, shared by every CMS member.
- **Checkpoint** — one immutable copy of the working copy from before the
  current 24-hour editing window. It exists only to undo a batch of rapid saves.
- **Public preview** — one immutable, explicitly promoted snapshot served at the
  page's public URL with `noindex, nofollow` while the page is in `preview`.
- **Publication** — an immutable snapshot created by publishing a working copy.
- **Live publication** — the publication the page points at while it is
  `published`. A `draft` or `preview` page has no live publication, though it
  may retain a last-published pointer for restoring or republishing.

### 14.2 The decisions, as decisions

1. **One working copy per page**, shared by every editor. No personal drafts and
   no branches: two people editing the same article is rare enough here that a
   merge model would cost more than it saves, and the shared copy plus the
   existing lock version already makes the collision visible.
2. **Three previous publications.** Not "keep everything": every retained
   publication also pins every image it references, so unbounded retention means
   a media library that can never be cleaned. Three answers "undo the last
   thing, and the thing before it" and stops there.
3. **Published content is stable.** A working-copy save never alters a public
   article, listing, sitemap, feed, `llms.txt`, or public cache.
4. **The public preview is explicit.** Promoting freezes a snapshot; later saves
   stay private until somebody refreshes it. That is the difference between a
   link an editor can send someone and a window onto whatever they are typing.
5. **One comparison baseline** — the live publication, or the last one when the
   page is down. See Task 2 for why there is no pairwise selector.
6. **Restore is private.** It copies a retained version into the working copy
   and changes no status, no public pointer and no cache. A restore that
   published would make "look at what this used to say" a dangerous click.
7. **Publishing clears the work.** A successful publication removes the working
   copy and its checkpoint; the next edit starts from what is now live.
8. **Retained content pins media.** Working copy, checkpoint, public preview,
   current publication and the three retained ones all count as media usage.

### 14.3 Invariants

- At most one `wip`, one `checkpoint` and one `preview` per page — partial
  unique indexes, because this is the invariant two concurrent saves race on and
  only the database can settle that race.
- At most four `published` revisions per page.
- `published` and `preview` revisions are immutable after insertion; only a
  `wip` is ever updated in place, and the `kind = 'wip'` predicate on that
  UPDATE is what keeps it so.
- A `published` page has a non-null published pointer; a `preview` page has a
  non-null preview pointer; a `draft` is returned by no public read.
- Every page, revision, media-usage, retention and pointer change belonging to
  one content operation commits in one transaction.
- `cms_page.lock_version` remains the single optimistic-concurrency token, and
  every accepted mutation bumps it — a working-copy save included, even though
  it writes no column on that row. A save that did not move it would let a
  second editor keep holding a version that is no longer current.

### 14.4 Data model

`cms_page` keeps identity, lifecycle and provenance, plus four pointers:
`published_revision_id`, `preview_revision_id`, `wip_revision_id`,
`checkpoint_revision_id`. All four are `restrict`: a pointer is how a document
is found, and a revision deleted out from under one would turn a published page
into a page with no body. The service clears the pointer first, inside the same
transaction that prunes the revision.

`cms_page_revision` holds the authored document — body, titles, description,
summary, CTA, canonical slug, metadata, parent, sort order, crumb, and the
editorial `content_updated_at` — plus `kind`, `based_on_revision_id`, and a
`publication_number` that is non-null only for publications and is never
accepted from browser or MCP input.

`slug` stays on the page, because it is identity rather than content. It is
already read-only in the editor, and restoring an old version does not move a
page's URL.

`cms_page` carries no authored column at all. It held them, nullable and
unread, for the release after the migration — the backfill's rollback path —
and they were dropped once the revision reads had been verified in production.

### 14.5 Operations

Every mutation claims the page first — `updateWithLock` with the version the
caller holds — and only then inserts, repoints and deletes. Zero rows updated is
the conflict check, atomic by construction; and a matched UPDATE takes a row
lock held to commit, so everything after it is serialized against a second
editor doing the same thing. The claim also _clears_ every pointer whose
revision the operation is about to replace or delete. Clear, delete, insert,
repoint — in that order, once per operation.

**1. Saving.** Opening an editor writes nothing. The first save lazily inserts
the working copy from the submitted document and records what it was based on;
later saves update it in place. Explicit Save only — no autosave. The response
carries the new lock version, the working-copy id and its update time.

**2. Twenty-four-hour compression.** Before updating an existing working copy:
if there is no checkpoint, copy the pre-save state into one; if the checkpoint
is younger than 24 hours, leave it; if it is older, replace it. The window is
rolling and measured in instants — saving at 23:58 and again at 00:02 is one
editing session, and a window that reset at midnight would manufacture a
checkpoint out of the clock. Ten saves in an hour therefore leave the state
before that window plus the latest, not ten intermediate bodies.

Restoring is a bigger replacement than a save, so it preserves the pre-restore
working copy as the checkpoint even inside the window — which is what makes the
restore itself undoable.

**3. Public preview.** Promoting requires a saved working copy, validates it at
preview level, and copies it into a new immutable `preview` revision, replacing
any previous one. The working copy survives, so editing continues privately, and
the UI says when the shared link has fallen behind and offers «Actualizar vista
previa pública». Moving a _published_ page into preview takes it out of public
discovery and serves the snapshot with `noindex, nofollow`; the confirmation
says so, and the last published pointer is retained.

**4. Publishing.** One transaction: check the lock, validate the working copy at
publish level, insert an immutable `published` revision with the next
publication number, repoint the page, delete the working copy, the checkpoint
and any now-obsolete preview, prune to three previous publications, reconcile
media usage, record the event. The cache tag is expired after commit, and a
failed invalidation is logged rather than reported as a failed publication.

A working copy byte-identical to the live publication does not manufacture a
duplicate — that would consume a retention slot and push the oldest publication
out for a click that changed nothing. The result says `noChange`, and removing
the working copy stays a separate decision («Descartar borrador»).

First publication still levels `content_updated_at` with `published_at`; later
ones keep the working copy's editorial time and the page's original
`published_at`.

**5. Unpublish, republish, discard.** Unpublishing sets the page to `draft`,
keeps the last published pointer, deletes the preview snapshot and invalidates.
Republishing with nothing new re-exposes the retained publication rather than
copying it. Discarding removes the working copy and its checkpoint, changes no
status and no public pointer — and is refused when the working copy is the only
content the page has, because that is «Eliminar esta página», which has its own
guards.

**6. Restore.** Copies a retained version's complete authored document into the
working copy, sets `based_on_revision_id`, preserves the previous working copy
as the checkpoint, validates at draft level, and touches nothing public.
Restoration covers Markdown, every metadata field, parent, sort order, crumb and
canonical slug. It does not restore identity, lifecycle status, revision
authorship or lifecycle timestamps.

### 14.6 Public reads and media

A public read resolves `published_revision_id` or `preview_revision_id` and
nothing else. That is the security property, and it is a property of the query
rather than of care: `publicPointer()` in
`src/content-system/repository/revisionSelection.ts` has no branch that returns
`wip`, and the repository's join is a `case` on status rather than a `coalesce`
of pointers — a `coalesce` would fall back to the preview snapshot of a
published page whose pointer was somehow null, quietly serving an unindexed copy
at a live URL.

`cms_media_usage` is keyed by revision, not by page. That is what makes "a
retained version keeps its images" true rather than aspirational: the
third-oldest publication still references the chart it was published with, so
trashing that chart is refused for as long as the publication is retained — and
the moment retention prunes it, the cascade releases the reference in the same
transaction. `reconcileMediaUsage()` derives from every retained revision. The
library's usage _count_ is still a count of pages, because that is the number a
person is asking for; the revision breakdown is in the detail view, which is
where somebody asking «¿por qué no puedo borrarla?» is looking.

### 14.7 History

The «Historial» tab shows two lists, because they answer two different
questions. Merging them was the previous design's mistake: it made every save
look like a version, and none of them were.

**Versions** are things you can open, compare and restore — bounded, at most
seven, every one a document. Newest first: working copy, checkpoint, public
preview, then the current publication and up to three previous. Actions are
«Vista previa», «Comparar con la versión publicada» and «Restaurar como
borrador».

**Activity** is `cms_page_event`, kept as a bounded strip beside them: at most
ten rows per page, and a run of saves by the same actor from the same source
inside a rolling 24 hours is coalesced into one row with a count. Creation
survives pruning for as long as the page does. It records no bodies and never
will — recoverable history is `cms_page_revision`.

**Comparison** is Markdown line-by-line plus authored fields and metadata at
field level. Reordered arrays are changes; nothing is semantically merged.
Additions and removals never rely on colour alone: every changed line carries a
`+`/`−` and a screen-reader word, and the field table says «antes»/«ahora» in
text.

### 14.8 Interface

The tabs are `Markdown | Vista previa | Validación | Historial`, and the button
is `Validar`. The old `Revisión`/`Revisar` collided with revision vocabulary the
moment versions existed — the same word for "check this page" and "a stored copy
of it".

The header says which copies exist, rather than repeating the status chip beside
it: `Publicada · sin borrador`, `Publicada · borrador guardado`, `Vista previa
pública · borrador más reciente disponible`, `Borrador · nunca publicada`, plus
the existing `Sin guardar` for unsaved browser state. «Guardar» always means
save the working copy and never implies publication.

Every confirmation names the state it affects. The whole risk of a four-copy
model is that the button you pressed and the copy it moved are not obviously the
same thing.

### 14.9 MCP

`get_content` returns the page's lifecycle alongside the document: whether a
working copy exists, what it was based on, the live publication id, whether the
public preview has fallen behind, and the lock version. `update_content` saves
the working copy — which is why the server now tells agents that editing a
published page is safe and needs no permission. `set_content_status` stays the
one tool that changes what the public sees and the one that needs the human's
go-ahead every time, in both directions.

Added: `list_content_versions`, `get_content_version`,
`compare_content_version` (`cms:read`), `restore_content_version` and
`discard_content_wip` (`cms:write`). None of them changes public output.
`discard_content_wip` is annotated destructive because it throws away editorial
work with nothing behind it; `restore_content_version` is not, because the copy
it overwrites is kept as the checkpoint.

### 14.10 How it was migrated

Done, in production, on 2026-08-22. The scripts are deleted; this is what they
did, kept because the _shape_ of the data they produced is the shape the code
now assumes.

Every existing page became exactly one revision: `published` → a publication
numbered 1, `preview` → a preview snapshot, `draft` → a working copy. No older
publications were invented, so a page that predates revisions has one version
and its history says so rather than implying there is something to restore.
`cms_media_usage` was truncated and re-derived from the new revisions rather
than converted, because it is a cache of a pure function and rebuilding it is
cheaper than migrating it.

Two things are worth keeping, because they are properties of the data rather
than of the migration:

- **Publication numbers start at 1 and mean nothing historically.** A page
  published forty times before the migration still shows publication 1 as its
  oldest kept version.
- **`published_at` on those first revisions is the page's own first-publication
  date**, or its creation date where the page never had one. It is not the
  instant the migration ran.

The one implementation note worth remembering, because it will apply to the next
migration too: the backfill copied column to column inside the database rather
than reading rows into Node and writing them back. `timestamptz` keeps
microseconds and a JS `Date` keeps milliseconds, so the round trip silently
truncates `content_updated_at` — which the verification pass caught by comparing
every copied document against the row it came from.

### 14.11 Boundaries

- Revision SQL lives in `src/cms/server/revisionStore.ts`; policy and lifecycle
  live in `CmsContentService`. Page-row SQL, including the pointers, stays in
  `src/cms/server/store.ts`.
- Public revision selection lives in `src/content-system/repository/`, never in
  CMS UI code.
- `src/cms/boundaries.test.ts` confines `cms_page_revision` the way it already
  confines `cms_page`. A revision written outside the service is a copy with no
  pointer, no retention and no media usage — invisible to history, and pinning
  images nothing will ever release.
