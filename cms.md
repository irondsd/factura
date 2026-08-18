# Factura CMS implementation plan

> Status: proposed
>
> Scope of iteration 1: a private, database-backed publishing console for
> `/guias`, including agent access through a separate CMS MCP endpoint.
>
> This file is the implementation checklist. An item may be marked complete only
> after its code, tests, and relevant runtime verification are complete. Add a
> short note or link beneath a checkbox when the implementation differs from the
> decision recorded here.

## 1. Objective

Move guide content out of application source files and into PostgreSQL without
introducing a paid or separately hosted CMS. Editors should be able to create,
edit, validate, preview, publish, and unpublish guides from `/cms`. Authorized
agents should be able to perform the same content operations through a separate
MCP endpoint.

The CMS is an internal publishing tool, not a general-purpose CMS. Iteration 1
deliberately uses one mutable copy of each page and does not include revision
history. Published edits become eligible for the public cache immediately after
save and normally appear within the one-hour cache window.

## 2. Architectural direction

Factura is expected to become two deployments later:

1. `factura.uno`: public site, public content rendering, and CMS.
2. `app.factura.uno`: authenticated bill application currently under `/app`.

Iteration 1 must make that split easier rather than add new coupling.

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

### 2.3 Temporary shared dependencies

Iteration 1 intentionally shares these with the current application:

- Auth.js session and user identity.
- PostgreSQL connection and Drizzle schema.
- Public article layouts and public content components.
- Global fonts/tokens where useful.

All CMS authorization must go through a small adapter (`src/cms/auth`) so a
future deployment can replace shared Auth.js/database access without rewriting
CMS pages or services.

### 2.4 Development and production database policy

The local PostgreSQL database is the required development and testing target.
Agents are explicitly allowed and expected to create CMS tables, grant local CMS
membership, import and re-import guides, create test pages, and exercise every
lifecycle/MCP operation against the local database. Local content is disposable
development data; using it fully is not a risk or a workaround.

Rules:

- Use the Postgres service from `docker compose` and the normal local environment
  configuration for all implementation phases.
- Start it with `docker compose up -d db` when needed and verify it with
  `docker compose ps`.
- Apply schema changes and run the guide importer locally first.
- It is fine to clear or re-import CMS rows in the local database when testing
  idempotence, as long as commands target the CMS tables explicitly.
- Complete validation parity, browser verification, MCP verification, and the
  full build/lint/typecheck/test floor against local data.
- Do not point development, automated tests, agent verification, or migration
  experiments at the production database.
- Do not use `.env.prod` or production database commands before the dedicated
  production rollout phase and explicit authorization to perform that rollout.
- The first production CMS database work happens only after every implementation
  task before section 13—including all three content sections, importers, public
  renderers, and rollback paths—has passed locally on `cms`.
- Production content migration is a branch-wide deployment operation: back up,
  apply schema, dry-run all imports, import, verify parity, merge `cms` into
  `main`, deploy, then cut over public reads.

The import tooling must make the target environment obvious in its output and
must require an explicit production flag/confirmation rather than silently
choosing production from ambient configuration.

### 2.5 Branch, production migration, and merge policy

All work described before section 13—including the guides-first implementation
and the statistics/research migration in section 12—must be developed on the
single long-lived branch named exactly `cms`.

Rules:

- Create or switch to `cms` before implementation begins.
- Keep all CMS code, schema changes, importers, migrations, source-content
  compatibility, and documentation on `cms` until the complete simple CMS is
  ready.
- Do not merge the guides milestone into `main` separately. Guides,
  statistics, and research are one integration program even though they have
  separate implementation gates.
- Commit incremental, reviewable changes on `cms` and keep the branch current
  with `main` as needed, resolving integration drift on `cms`.
- Run the build/lint/typecheck/test/content-validation floor repeatedly
  throughout development, not only at the final gate.
- Use only local PostgreSQL during implementation and migration rehearsal.
- After every task through section 12 passes locally, perform one explicitly
  authorized production database rollout from the reviewed `cms` branch:
  backup, schema migration, dry-run imports, imports, and parity verification.
- Production database migration happens before merging `cms` into `main`. The
  current `main` deployment must remain compatible while the new additive CMS
  tables are populated.
- If production migration or parity verification fails, do not merge `cms`.
- Merge `cms` into `main` only after production data is ready and verified.
- Deploy the merged `main` branch, which performs the public read cutover, then
  run the final production browser/discovery/MCP smoke checks.
- Keep source MDX and rollback switches through the post-merge observation
  window. Remove them only in a later reviewed cleanup.

Section 13 work starts in a new follow-up branch after `cms` has been merged and
the simple CMS is stable in production.

## 3. Iteration 1 decisions

### 3.1 Content scope

- Migrate all `/guias` MDX documents to PostgreSQL.
- Keep `/estadisticas` and `/investigacion` filesystem-backed in iteration 1.
- Keep their public behavior unchanged.
- Make public discovery surfaces consume a combined repository so database
  guides and filesystem-backed sections can coexist.
- Do not delete the guide MDX files until migration parity and rollback have
  been verified. Keep them through the branch-wide merge and observation window;
  remove them in a later, explicit cleanup.

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
- Unpublishing changes `published` to `draft`; delayed disappearance within the
  one-hour cache window is accepted in iteration 1.
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
- Do not implement publish-time path/tag invalidation in iteration 1.
- Document in the UI that public changes may take approximately one hour plus
  the next request to appear. TTL is not an exact scheduled rebuild.

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
- Use explicit Save in iteration 1; do not add autosave.
- Warn before navigating away with unsaved changes.
- Component autocomplete and property suggestions are optional iteration 1
  enhancements, not release blockers.

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

Iteration 1 guide components are:

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
- `preview_image`

The CMS presents normal fields and controls; editors never edit raw metadata
JSON. Define one Zod schema shared by forms, mutations, MCP tools, migration,
validation, and public rendering.

## 4. Iteration 1 data model

Names may be adjusted to match existing Drizzle conventions, but preserve the
separation and semantics.

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
- Both roles may author in iteration 1. Only `admin` may manage CMS API tokens.
- Whether only admins may publish is a policy toggle in the authorization
  service; iteration 1 may allow both trusted editors to publish.

### 4.2 `cms_pages`

```text
id                    uuid primary key
section               text not null              # `guias` in iteration 1
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
with children can never be removed silently — iteration 1 has no hard delete at
all, so it is a guard against a later one.

`lock_version` is optimistic concurrency, not revision history. Every update
includes the version last read by the editor/agent and increments it. A mismatch
returns a conflict and never overwrites another save.

Define deletion semantics in iteration 1 as archive-by-status, not hard delete.
Do not expose a destructive delete action.

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
- Iteration 1 scopes: `cms:read` and `cms:write`.
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

Keep adapters for:

```ts
documentsFromFilesystem(); // CI and migration comparison
documentsFromDatabase(); // CMS and public site
```

The existing `bun run validate:content` command must continue to work during
the migration. At cutover it should validate database-export fixtures or a
database snapshot in a deterministic manner; CI must not require production
database access.

### 5.3 Save/transition policy

- Draft Save: store the content and return diagnostics. Ordinary errors do not
  block saving incomplete work.
- Security errors: store only if the implementation can guarantee the body is
  never compiled; preferred v1 behavior is to reject the save and preserve the
  previous saved value.
- Open Preview: requires grammar and document validation with no errors.
- Set Public Preview: same gate as Open Preview.
- Publish: requires grammar, document, collection, and render validation with
  no errors.
- Published Save: requires publish-level validation because no prior published
  revision exists to serve as fallback.
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

Iteration 1 routes, scoped by section:

```text
/cms                            section index
/cms/[section]                  that section's content list
/cms/[section]/new              create a page in that section
/cms/[section]/[id]             metadata + Markdown editor
/cms/[section]/preview/[id]     exact private saved preview
/cms/tokens                     CMS MCP token management (admin only)
```

`[section]` mirrors the **public** path, so `/cms/investigaciones` edits what
readers see at `/investigaciones`. An editor should never have to hold two names
for one section in their head.

That segment is not always the `cms_page.section` value — research is
`investigaciones` publicly and `investigacion` in the column, a plural the
public URLs adopted and the data never did. `src/cms/sections.ts` is the single
place that mapping is written down, and `findCmsSectionBySegment` is the only
way to cross it, so no route file knows about the exception.

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
The preview renders in the _article_ shell with no CMS chrome (Phase 6), which a
route nested under the editor would inherit.

A section may be registered as `planned`: it appears on `/cms` so editors can
see what is coming, but `/cms/[section]` 404s rather than opening a half-built
editor. Statistics and research are `planned` until section 12 promotes them.

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

Applied in iteration 1:

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
  one is §12's "every intermediate path exists" invariant, applied to all three
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
- No hard-delete button exists in iteration 1.

## 8. CMS MCP surface

Create `/api/cms/mcp` as a separate stateless protected resource. Reuse the
existing MCP protocol primitives where appropriate, but keep configuration,
instructions, auth, scopes, tools, and tests under `src/cms/mcp`.

Iteration 1 tools:

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

## 9. Iteration 1 implementation checklist

### Phase 0 — Confirm baseline and inventory

- [x] Create or switch to the branch named exactly `cms` and confirm all work
      through section 12 will remain on it until the branch-wide merge gate.
- [x] Start and verify the local Postgres service with `docker compose`; record
      that all CMS development and testing will target the local database.
- [x] Run `bun run build`, `bun run lint`, `bun run typecheck`, and `bun run test`
      before implementation and record any pre-existing failures below.
- [x] Run `bun run validate:content` and save the baseline count of errors and
      warnings.
- [x] Inventory every guide metadata field and record whether it maps to a
      dedicated column or JSONB.
- [x] Inventory every guide custom component, its properties, children rules,
      and allowed values.
- [x] Inventory every consumer of guide content: article route, index,
      categories, related guides, metadata, JSON-LD, sitemap, RSS, `llms.txt`,
      OG images, validation, and IndexNow.
- [x] Add a short implementation note here for any consumer or component missed
      by this plan.

**Gate:** No schema or route work begins until the content and consumer
inventories are complete.

#### Phase 0 inventory results

Recorded 2026-08-18. Source of truth for the fields is
`src/content/guias/guides.ts` (`GuideMeta`); the 43 `.mdx` files under
`src/content/guias/` were counted directly.

##### Guide metadata fields → storage

| `GuideMeta` field | Present in | Required | Iteration 1 storage             | Note                                                          |
| ----------------- | ---------- | -------- | ------------------------------- | ------------------------------------------------------------- |
| `title`           | 43/43      | yes      | column `title`                  |                                                               |
| `description`     | 43/43      | yes      | column `description`            |                                                               |
| `summary`         | 43/43      | yes      | column `summary`                |                                                               |
| `cta`             | 43/43      | yes      | column `cta`                    | `<TopCta>` copy                                               |
| `keywords`        | 43/43      | yes      | JSONB `metadata.keywords`       | `string[]`                                                    |
| `categories`      | 43/43      | yes      | JSONB `metadata.categories`     | `CategoryId[]`, 1–3, first is primary                         |
| `published`       | 43/43      | yes      | column `published_at`           | ISO 8601 with `-03:00` offset                                 |
| `updated`         | 43/43      | yes      | column `content_updated_at`     | ISO 8601 with offset                                          |
| `faq`             | 18/43      | no       | JSONB `metadata.faq`            | `{ q, a }[]`; drives `<Faq />` **and** FAQPage JSON-LD        |
| `preview`         | 15/43      | no       | JSONB `metadata.preview_image`  | path under `/img/guias/previews/`                             |
| `vendor`          | 10/43      | no       | JSONB `metadata.vendor`         | JSON-LD `about` + OG eyebrow                                  |
| `titleTag`        | 2/43       | no       | column `title_tag`              | `<title>` override only                                       |
| `ogImage`         | 1/43       | no       | JSONB `metadata.og_image`       | `{ eyebrow?, stat? }` — text slots, not an image URL          |
| `ogTitle`         | 0/43       | no       | JSONB `metadata.og_title`       | typed but unused today; keep                                  |
| `ogDescription`   | 0/43       | no       | JSONB `metadata.og_description` | typed but unused today; keep                                  |
| `canonical`       | 0/43       | no       | column `canonical_slug`         | cannibalization lever; also drops the guide from sitemap/feed |
| `noindex`         | 0/43       | no       | **not a column** — see below    |                                                               |

Two deviations from section 3.7 worth recording:

- `noindex?: true` is not stored as metadata. It is exactly the plan's
  `preview` lifecycle state (renders at its URL, excluded from every listing),
  so the importer maps `noindex: true` → `status = 'preview'` and its absence →
  `status = 'published'`. Nothing currently sets it, so all 43 guides import as
  `published`. Recorded here because section 3.7 lists neither field.
- The plan's `title_tag` / `canonical_slug` columns correspond to `titleTag` /
  `canonical`. `slug` itself is the filename, not a `meta` field.

`ogImage` is a `{ eyebrow?, stat? }` text pair that steers the generated card,
**not** an uploaded image. The plan's `og_image` JSONB key keeps that shape;
the CMS form must present two text inputs, not a file field.

##### Guide component surface

Six components appear in guide MDX. All six are already in the plan's list; the
audit found no additional ones.

| Component        | Uses | Kind                             | Props                                                    | Source                                     |
| ---------------- | ---- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `RelatedGuides`  | 43   | leaf                             | none — the article route binds the resolved list         | `src/components/guides/RelatedGuides.tsx`  |
| `ClosingCta`     | 43   | container (all 43 pass children) | `title?: string`                                         | `src/components/guides/cta.tsx`            |
| `Faq`            | 18   | leaf                             | none — bound to `meta.faq` by the article route          | `src/components/article/Faq.tsx`           |
| `TrustBlock`     | 14   | leaf                             | none (`className` is bound in `mdx-components.tsx`)      | `src/components/landing/TrustBlock.tsx`    |
| `ProbarCta`      | 14   | container (all 14 pass children) | `vendor?: string`, `noun?: string` (default `"factura"`) | `src/components/guides/cta.tsx`            |
| `InflacionChart` | 10   | leaf                             | `chart: ChartId` (required, enum)                        | `src/components/guides/InflacionChart.tsx` |

`InflacionChart`'s `chart` is a closed enum of 7 ids in
`src/content/guias/data/inflacion.ts` (`CHART_IDS`): `servicios-vs-general`,
`cuanto-subio-cada-servicio`, `pesos-vs-dolares`, `luz-y-gas`, `expensas`,
`agua-y-vivienda`, `internet-y-celular`. The manifest's Zod schema must be a
`z.enum` derived from `CHART_IDS`, not a free string.

`InflacionChart` is the only component reached by a local `import` — 8 guide
files import it from `@/components/guides/InflacionChart` for 10 usages. Those
8 import lines are the only imports in any guide body and are the exact set
Phase 3/Phase 7 must move to the manifest and strip.

The global map in `src/mdx-components.tsx` exposes six further components no
guide currently uses: `CtaButton`, `CtaRow`, `DemoCta`, `SignupCta`,
`PaginaRelacionada`, and the `Fuentes`/`Subpaginas` no-ops. The manifest must
decide each one's `sections` explicitly rather than inheriting the global map —
`PaginaRelacionada`, `Fuentes`, and `Subpaginas` belong to
`estadisticas`/`investigacion` (section 12), not to `guias`.

`Faq`, `RelatedGuides`, `Fuentes`, and `Subpaginas` are article-context
components: `mdx-components.tsx` registers them as no-ops and the article route
overrides them through the `components` prop, because `useMDXComponents()` takes
no arguments. The CMS preview route (Phase 6) must perform the same binding or
those blocks silently render nothing.

##### Guide content consumers

| Consumer        | File                                                                                        | Reads                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Article route   | `src/app/(site)/[lang]/guias/[slug]/page.tsx`                                               | `loadGuide`, `guideSlugs`, `guideStats`, `guideHeadings`, `relatedGuides`                     |
| Guides index    | `src/app/(site)/[lang]/guias/page.tsx`                                                      | `guidesByPrimaryCategory`, `listedGuides`                                                     |
| Category hubs   | `src/app/(site)/[lang]/guias/categoria/[categoria]/page.tsx`                                | `guidesInCategory`, `nonEmptyCategories`                                                      |
| Guides layout   | `src/app/(site)/[lang]/guias/layout.tsx`                                                    | Spanish-only guard                                                                            |
| Related guides  | `src/components/guides/RelatedGuides.tsx`                                                   | `Guide` type                                                                                  |
| Guide list rows | `src/components/guides/GuideList.tsx`                                                       | `Guide` type                                                                                  |
| Category chips  | `src/components/guides/CategoryChips.tsx`                                                   | `categories.ts`                                                                               |
| Page metadata   | `src/i18n/metadata.ts` (`guideMetadata`, `guideUrl`, `guideCardUrl`, `guideCategoryUrl`)    | title/titleTag/description/ogTitle/ogDescription/keywords/published/updated/canonical/noindex |
| JSON-LD         | `src/i18n/structuredData.ts` (`guideLd`, `faqPageLd`)                                       | full meta + word/minute stats                                                                 |
| Sitemap         | `src/app/sitemap.ts`                                                                        | `listedGuides`, `nonEmptyCategories`                                                          |
| RSS feed        | `src/app/feed.xml/route.ts`                                                                 | `listedGuides`, `getCategory`                                                                 |
| `llms.txt`      | `src/app/llms.txt/route.ts`                                                                 | `guidesByPrimaryCategory`, `nonEmptyCategories`                                               |
| OG cards        | `src/app/og/guias/[slug]/card.png/route.tsx`                                                | `loadGuide` meta: `title`, `vendor`, `ogImage`, `categories`                                  |
| Validation      | `scripts/validate-guides.ts`, `scripts/validate-content.ts`, `scripts/validate-sections.ts` | filesystem MDX                                                                                |
| IndexNow        | `scripts/ping-indexnow.ts`                                                                  | URL arguments only — no registry import                                                       |

Consumers **not** named in the plan's checklist, found by this audit:

- **Landing page guide block** — `src/app/(site)/[lang]/page.tsx` calls
  `listedGuides()` and renders the newest guides as cards
  (`title`, `summary`, `preview`, `published`). Must move to the repository at
  cutover or the home page keeps reading the filesystem.
- **Normativa page** — `src/app/(site)/[lang]/normativa/page.tsx` calls
  `listedGuides()` to build a slug → title map so its cards can name the guide
  they link to. A slug with no listed guide renders no link, so an unpublished
  guide degrades correctly; the call still has to move to the repository.
- **Cross-section link validation** —
  `scripts/validate-sections.ts` validates `/guias/*` links from the statistics
  and research sections against the guide slug set. After cutover this needs a
  database-or-snapshot slug source, otherwise section 12's validation breaks.
- **`src/i18n/routing.ts`** hardcodes `/guias` in the list of Spanish-only
  section prefixes; unchanged by the migration but it is a guide-path consumer.
- **`scripts/ping-indexnow.ts`** takes paths as arguments and imports nothing
  from the registry, so it needs no migration work — recorded so Phase 7 does
  not go looking for one.

Additional facts the plan's data model should absorb:

- `guideStats` and `guideHeadings` read the `.mdx` file from disk with
  `fs.readFileSync` and are called per-request by the article route. The
  database repository must compute reading time and headings from `body_mdx`
  instead; `readingStats` counts the FAQ text too (`src/content/mdx.ts`,
  `src/content/headings.ts`).
- `guideHeadings` appends a synthetic FAQ heading only when the body actually
  contains `<Faq`, which is what keeps the table of contents honest. That rule
  must survive into the repository.
- `listedGuides()` is memoized in a module-level promise for the process
  lifetime. The database repository replaces this with the one-hour
  `unstable_cache` from section 3.3; the memo must not be carried over or
  published edits will never appear in a warm process.
- `allGuides()` is deliberately unexported so drafts cannot leak into listings.
  The repository contract in section 6 is the direct replacement for that
  invariant and must keep it enforced in one place.
- Guide slugs come from filenames, so `slug` has no `meta` field to import
  from — the importer derives it from the filename.

### Phase 1 — Establish isolated CMS shell and authorization

- [x] Add `cms_role` and `cms_page_status` database enums.
- [x] Add the `cms_members` table.
- [x] Add Drizzle relations and migrations using the project's normal schema
      workflow.
- [x] Create `src/cms/auth/requireCmsMember.ts` (or equivalent) as the only CMS
      role-checking entry point.
- [x] Add unit tests for anonymous, non-member, editor, removed-member, and admin
      authorization outcomes.
- [x] Create the independent `src/app/(cms)/layout.tsx` root layout.
- [x] Create the `/cms` route and minimal CMS-only shell under
      `src/cms/components`.
- [x] Add private/noindex metadata for every CMS route.
- [x] Exclude `cms` from `src/proxy.ts` locale rewriting.
- [x] Verify `/cms` redirects anonymous users, rejects signed-in non-members,
      and renders for a manually inserted member.
- [x] Confirm no `src/cms` file imports from `src/components/app` or app-domain
      routers.

**Gate:** Authorization is enforced server-side, not only by hidden navigation.

#### Phase 1 implementation notes

Recorded 2026-08-18. Everything below ran against local PostgreSQL
(`docker compose` service `db`); no production command was run.

Files added or changed:

| File                               | Role                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `src/db/schema.ts`                 | `cms_role` + `cms_page_status` enums, `cms_member` table                 |
| `src/cms/types.ts`                 | `CmsRole`, `CmsActor`, `CmsAccess`                                       |
| `src/cms/auth/policy.ts`           | pure authorization rules — no I/O                                        |
| `src/cms/auth/policy.test.ts`      | the five outcomes plus the capability toggles                            |
| `src/cms/auth/requireCmsMember.ts` | the single CMS gate; the only file that touches Auth.js and `cms_member` |
| `src/cms/metadata.ts`              | `noindex, nofollow, nocache` for the whole subtree                       |
| `src/cms/components/CmsShell.tsx`  | CMS-only chrome                                                          |
| `src/cms/boundaries.test.ts`       | enforces the §2.2 dependency rules as a test                             |
| `src/app/(cms)/layout.tsx`         | independent CMS root layout                                              |
| `src/app/(cms)/cms/page.tsx`       | thin route adapter                                                       |
| `src/proxy.ts`                     | `cms` added to the matcher's exclusion list                              |

Deviations from the plan text, and why:

- The table is `cms_member`, singular, not `cms_members`. Every table in
  `src/db/schema.ts` is singular (`property_member`, `api_token`, `oauth_token`)
  and the Drizzle export is plural (`cmsMembers`). Section 4 permits adjusting
  names to existing conventions; the columns and semantics are as specified.
- No Drizzle `relations()` call was added: this schema does not use the
  relations API anywhere, and joins are written explicitly. Adding it for one
  table only would be a new convention, not the project's normal workflow.
- No migration file was written, for the same reason: the project's schema
  workflow is `bun run db:push` (drizzle-kit push) with no `drizzle/` directory
  under version control. The production rollout in section 12 must therefore be
  a reviewed `db:push` against a backed-up database, not an `up.sql` — worth
  knowing now rather than at the gate.
- `robots.txt` was deliberately **not** changed. `src/app/robots.ts` documents
  the reasoning: a disallowed URL is one a crawler can never read a `noindex`
  from, so private HTML pages here are crawlable and say `noindex` in the
  markup. The CMS follows that, which is why `cmsRootMetadata` exists.
- `canPublish`/`canAuthor` are driven by role arrays rather than returning a
  constant `true`, so §4.1's "policy toggle" is a real one-line edit and lint
  does not flag an unused parameter.

Authorization behaviour, verified at runtime on `http://localhost:4000/cms`:

| Case                   | Result                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------- |
| anonymous              | `307` → `/login?next=%2Fcms`, no `x-middleware-rewrite` header                     |
| signed-in non-member   | `404`, rendered inside the CMS layout — no editor data, no hint the surface exists |
| `editor` member        | `200`, shell renders, `Tokens` nav link absent                                     |
| `admin` member         | `200`, `Tokens` nav link present                                                   |
| membership row deleted | `404` on the very next request, same session cookie                                |

The nav filtering above is cosmetic. `requireCmsMember` is the boundary, and
`/cms/tokens` will call it with the admin check of its own in Phase 8.

Granting membership locally (there is no self-service path, by design):

```sql
insert into cms_member (user_id, role)
select id, 'admin' from users where email = 'you@example.com'
on conflict (user_id) do update set role = excluded.role;
```

Floor after Phase 1, all against local PostgreSQL:

```text
build:            pass — /cms builds as ƒ (dynamic)
lint:             pass — 0 errors, 0 warnings
typecheck:        pass
test:             pass — 50 files / 734 tests (baseline 48 / 720; +14 CMS tests)
validate:content: pass — 63 files · 0 errors · 0 warnings (unchanged)
```

### Phase 2 — Add content schema and repository contracts

- [x] Add the `cms_pages` table, unique constraint, timestamps, authorship, and
      `lock_version`.
- [x] Define `ContentDocument`, `ContentSummary`, lifecycle, metadata, and
      diagnostic types in `src/content-system/types.ts`.
- [x] Define the shared Zod guide metadata schema.
- [x] Implement the public `ContentRepository` contract.
- [x] Implement the authenticated CMS repository/service contract.
- [x] Add repository tests for every lifecycle visibility rule.
- [x] Add optimistic concurrency tests proving stale saves cannot overwrite a
      newer save.
- [x] Ensure callers outside repository/service modules do not query
      `cms_pages` directly.

**Gate:** Lifecycle behavior is proven at the repository layer before UI work.

#### Phase 2 implementation notes

Recorded 2026-08-18, against local PostgreSQL only.

| File                                          | Role                                                        |
| --------------------------------------------- | ----------------------------------------------------------- |
| `src/db/schema.ts`                            | `cms_page` table, unique `(section, slug)`, `lock_version`  |
| `src/content-system/types.ts`                 | `ContentDocument`, `ContentSummary`, statuses, `Diagnostic` |
| `src/content-system/metadata/guias.ts`        | the one Zod guide metadata schema                           |
| `src/content-system/repository/visibility.ts` | the §3.2 lifecycle table, as pure functions                 |
| `src/content-system/repository/contract.ts`   | `ContentRepository`                                         |
| `src/content-system/repository/mapping.ts`    | the only row → document translation                         |
| `src/content-system/repository/postgres.ts`   | public repository                                           |
| `src/cms/server/store.ts`                     | authenticated SQL, including the concurrency UPDATE         |
| `src/cms/server/lifecycle.ts`                 | §5.3 save/transition levels, pure                           |
| `src/cms/server/errors.ts`                    | conflict / not-found / invalid / forbidden / slug-taken     |
| `src/cms/server/contentService.ts`            | the single mutation entry point for browser **and** MCP     |
| `src/cms/server/testDb.ts`                    | local-only test connection, with a non-local guard          |

Deviations and decisions:

- **`created_by` / `updated_by` are nullable**, against §4.2's `not null`.
  Accounts are hard deleted (`deleteUserRecord`), and both answers a non-null
  column can give are wrong: `cascade` deletes the public site's content along
  with an author's account, and `restrict` makes deleting that account fail
  permanently. They are `on delete set null` — content outlives its author and
  provenance degrades to unknown, which §13.8 replaces with external subject
  ids anyway.
- **`section` is `text`, not an enum**, as §4.2 specifies. Recorded because it
  is load-bearing for section 12: adding `estadisticas` needs no enum
  migration. The allowed values are a TypeScript union checked on the way in.
- **The service takes its validator as a constructor argument** with no
  default. Phase 4 supplies the real one. A default would be a service that
  silently permits everything, and there would be no way to tell a wired-up
  call site from an unwired one.
- **Validation is not run on `create`.** A new page is always `draft`, and a
  draft is allowed to be incomplete (§5.3). Diagnostics come from
  `validateOnly`, which is what the Validation tab and the MCP's
  `validate_content` call.
- **Caching is deliberately absent from the repository.** §3.3 puts the
  one-hour `unstable_cache` at the call site in Phase 7, where `revalidate` has
  to be statically analyzable — and a repository that cached itself could not be
  reused for the CMS's uncached previews.
- **`unstable_cache`, the composite repository and the filesystem adapter are
  Phase 7**, not Phase 2. The contract exists so that cutover is a change of
  implementation rather than a change of shape.

Two rules the plan states in prose are now enforced by tests rather than
review:

- `src/cms/boundaries.test.ts` fails if any module outside
  `content-system/repository/postgres.ts`, `repository/mapping.ts` and
  `cms/server/store.ts` references `cmsPages`. It also asserts those two _do_,
  so a rename cannot make the check vacuous.
- The same file already enforced the §2.2 import rules from Phase 1.

##### Database-backed tests

`.github/workflows/ci.yml` has no PostgreSQL service, so `bun run test` must
stay green without one. The lifecycle and concurrency proofs need a real
database — a `where` clause and an UPDATE's row count are not exercised by a
stub — so they live in `contentService.integration.test.ts` and are registered
only when `DATABASE_URL` is set:

```bash
bun run test:db
```

`src/cms/server/testDb.ts` refuses any non-local host outright rather than
skipping, because a suite that writes and deletes rows pointed at production is
not something to fail quietly. Test rows are prefixed `zz-cms-test-` and only
rows with that prefix are ever deleted — the local database also holds
hand-made pages and, from Phase 7, imported guides.

Note that `describe.skip` still evaluates its callback, so the skip branches
_before_ the suite is registered; otherwise the connection is opened on a
machine that has no database and the file fails to collect.

`vitest.config.ts` now aliases `server-only` to an empty stub
(`test/stubs/server-only.ts`). Next resolves that marker through its own
bundler alias and the package is not in `node_modules`, so any test touching a
server module failed on the import. The guard it provides is a build-time one
and `bun run build` still enforces it.

##### What the gate proved

Sixteen integration tests against local PostgreSQL, covering: draft hidden from
`getByPath`/`listPublished`/`listPubliclyRenderable`; preview renders at its URL
but is absent from listings and present in `listPubliclyRenderable`; published
renders and lists; unpublish removes it from public reads while keeping
`published_at`; every status visible to the CMS; duplicate slug refused; a stale
save rejected with the _actual_ version reported and the winning save intact; a
stale status transition likewise; `lock_version` incrementing per accepted
save; `content_updated_at` moving on an edit but not on a status flip; publish
refused when validation fails while take-down still succeeds; a grammar-level
failure blocking even a draft save with the previous body intact; metadata
round-tripping through JSONB.

Floor after Phase 2:

```text
build:            pass
lint:             pass — 0 errors, 0 warnings
typecheck:        pass
test:             pass — 53 files / 771 tests, 1 file skipped (no database)
test:db:          pass — 54 files / 788 tests
validate:content: pass — 63 files · 0 errors · 0 warnings (unchanged)
```

### Phase 3 — Build the restricted MDX and component system

- [x] Create the typed content component manifest.
- [x] Register every guide component and its Zod property schema.
- [x] Move `InflacionChart` resolution out of per-document imports and into the
      manifest.
- [x] Implement AST-based restricted-MDX grammar validation.
- [x] Reject imports, exports, expressions, functions, event handlers, spreads,
      scripts, unknown components, and invalid properties.
- [x] Return stable diagnostic codes plus severity, message, line, and column.
- [x] Implement rendering from a database string only after grammar validation.
- [x] Preserve `remark-gfm` and heading-slug behavior used by current pages.
- [x] Add tests for every allowed component.
- [x] Add tests for every forbidden syntax category.
- [x] Add tests for malformed/nested tags and invalid component properties.
- [x] Add a test proving forbidden content cannot reach compilation/evaluation.

**Gate:** Database content cannot execute arbitrary JavaScript.

#### Phase 3 implementation notes

Recorded 2026-08-18.

| File                                          | Role                                             |
| --------------------------------------------- | ------------------------------------------------ |
| `src/content-system/components/manifest.tsx`  | the typed manifest — 10 guide components         |
| `src/content-system/validation/grammar.ts`    | AST-based restricted-MDX validation              |
| `src/content-system/render/renderContent.tsx` | compile-from-database, gated on the above        |
| `src/mdx-components.tsx`                      | new `markdownComponents` export (see below)      |
| `test/renderToHtml.ts`                        | test helper that renders async server components |

`@mdx-js/mdx@3.1.1` is now a direct dependency. It was already present
transitively through `@mdx-js/loader`; this phase imports it directly, so it is
declared.

##### How the gate is enforced

`createProcessor().parse()` builds an AST **without compiling or evaluating**.
Grammar validation walks that tree and `compileContent` refuses to call
`evaluate` unless the walk is clean. There is deliberately no "trusted" flag to
skip the check — that flag becomes the way every caller bypasses it.

The rule is an **allowlist, not a denylist**: every JSX element must be a
manifest component registered for that section, and everything else is rejected
by name. Raw HTML falls out of the same rule rather than needing its own — a
lowercase JSX name is an HTML element to MDX, so `<script>`, `<iframe>` and
`<img onerror=…>` are all "not a registered component". No guide contains raw
HTML today (verified across all 43), so this costs nothing.

Rejected categories, each with its own test: ESM (`import`/`export`), flow and
text expressions, spread attributes, expression-valued attributes (which is what
catches every event handler at once, rather than a list of `on*` names to keep
current), raw HTML, fragments, unknown components, components used in the wrong
section, content between the tags of a leaf component, invalid or missing
properties, and `javascript:`/`data:` hrefs.

Diagnostics carry a stable `code` from `GRAMMAR_CODES` plus severity, message
and 1-based line/column — the codes are API (the editor's lint gutter and the
MCP read them), the messages are not.

##### The proof that content cannot execute

`renderContent.test.tsx` compiles a body containing
`{(globalThis.__contentEscaped = true)}` and asserts both that the call rejects
_and_ that the global is still unset. Verified out-of-band that the same body
does set the global when `evaluate` is called without the gate — so the test
fails if the check is ever removed or moved after compilation, not merely if the
error message changes.

##### Parity with the filesystem path

The manifest binds what actually renders, not the bare component:

- `TrustBlock` is registered as the `className="my-10"` form, matching
  `mdx-components.tsx`. Registering the bare component would give a
  database-rendered guide different spacing from the same source — exactly what
  the exact preview in Phase 6 promises cannot happen.
- `Faq` and `RelatedGuides` are registered as the same `() => null` no-ops the
  global map uses, because they need article context. `contentComponents(overrides)`
  is how the article route binds them, the same mechanism the filesystem route
  already uses.

`markdownComponents` was added to `src/mdx-components.tsx` as a plain value.
`useMDXComponents` is the name `@next/mdx` requires and its `use` prefix makes
every linter treat it as a React hook, which it is not — it returns a module
constant. Database rendering needs the map outside a component.

The render pipeline uses `remark-gfm` and `rehype-slug`, matching
`next.config.ts` exactly. Both are load-bearing: the bill comparison tables are
GFM, and every heading id the contents column links to comes from `rehype-slug`.
A second, slightly different pipeline would make the CMS preview a lie.

##### Verification against real content

All **43 guide bodies** were run through `validateGrammar` with the meta block
and import lines stripped — the shape they will have in the database. **43
clean, 0 problems.** The restricted dialect accepts every existing guide, and
the manifest is complete for `guias`.

`InflacionChart` is registered centrally and is the only component reached by a
local import today; those eight import lines are what Phase 7 strips. The
manifest test asserts it is registered _and_ that the global map still does not
have it, so the two paths stay honest about which one resolves it.

Floor after Phase 3:

```text
build:            pass
lint:             pass — 0 errors, 0 warnings
typecheck:        pass
test:             pass — 56 files / 845 tests, 1 file skipped (no database)
test:db:          pass — 57 files / 862 tests
validate:content: pass — 63 files · 0 errors · 0 warnings (unchanged)
```

### Phase 4 — Refactor validation without losing CI coverage

- [x] Extract pure metadata and document validators from
      `scripts/validate-guides.ts`.
- [x] Extract pure cross-document validation from the current scripts.
- [x] Implement filesystem and database/snapshot adapters.
- [x] Preserve existing validator messages where practical so migration diffs
      remain understandable.
- [x] Add validation levels for draft save, preview, publish, and published save.
- [x] Add deterministic validator tests using in-memory documents.
- [x] Keep `bun run validate:content` operational during the transition.
- [x] Compare old and new validation reports over all existing guides and
      resolve unexplained differences.

**Gate:** Existing guides receive equivalent or stricter validation under the
new pure validator.

#### Phase 4 implementation notes

Recorded 2026-08-18.

| File                                           | Role                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/content-system/validation/text.ts`        | `fold` / `missingKeywordWords`, moved out of `scripts/lib/content.ts` |
| `src/content-system/validation/document.ts`    | layer 2 — every per-page rule, pure                                   |
| `src/content-system/validation/collection.ts`  | layer 3 — cross-page rules and `buildContentIndex`                    |
| `src/content-system/validation/index.ts`       | `validateContentDocument` / `validateContentCollection`, level policy |
| `src/content-system/adapters/mdxMeta.ts`       | the meta-block reader, moved out of `scripts/lib/content.ts`          |
| `src/content-system/adapters/filesystem.ts`    | `documentsFromFilesystem()`                                           |
| `src/content-system/adapters/database.ts`      | `documentsFromDatabase()` + snapshot serialization                    |
| `src/content-system/components/definitions.ts` | manifest rules, split from the React bindings                         |
| `src/cms/server/validation.ts`                 | wires the pure layers to the CMS service, adds layer 4                |
| `scripts/validate-guides.ts`                   | rewritten as a thin adapter over the above (529 → 74 lines)           |

##### One implementation, not two

The rules moved into `src/content-system/validation` and are now the same
functions the CMS editor, the publish gate and the CMS MCP call. Leaving the old
copy in place would have been less work and would have drifted within a phase or
two. `scripts/lib/content.ts` re-exports the moved helpers, so
`validate-sections.ts` and every other importer kept working untouched.

##### The manifest had to be split

Grammar validation needs the manifest, and `bun run validate:content` is a CLI —
importing the manifest pulled in the React component tree and failed on
`server-only`. `components/definitions.ts` now holds the rules (names, sections,
`kind`, Zod property schemas, descriptions) with no React import, and
`components/manifest.tsx` merges in the bindings for rendering. The manifest is
built by mapping over the definitions, so a name cannot be renderable without
being validated.

##### Old versus new: the comparison

Both validators were run over the 43 real guides **and** over 19 deliberately
broken variants of one guide — a mutation per rule: long title, short
description, bad dates, unknown category, self-canonical, broken link, missing
`<Faq />`, H1 in body, and so on.

- **The real corpus: identical.** `NO_COLOR=1 bun run validate:content` before
  and after the rewrite diffs to nothing, byte for byte.
- **18 of 19 mutations: identical**, message for message.
- **1 of 19 differs, deliberately:** an unrecognized `meta` key was a _warning_
  and is now an _error_. The wording is unchanged (`meta has unexpected key
"…"`); only the severity moved. A validated JSONB column cannot hold a key
  nothing reads, and the importer must not quietly drop one.

The first run of that comparison found three real bugs in the new validator, all
fixed before the rewrite landed:

1. When the metadata schema failed for _any_ reason, `faq` came back undefined
   and a body containing `<Faq />` was reported as "faq is missing" — a
   fabricated second error on top of the real one. The FAQ checks now read the
   raw metadata, so one broken field no longer invents findings about others.
2. `categories` was reported twice: once by the Zod schema and once by the
   explicit check that names the offending id. Zod issues for fields with their
   own wording are now skipped.
3. A canonical pointing at a slug that does not exist got both "is not a guide
   slug" (document layer) and "is not published" (collection layer). The
   collection rule now fires only when the target actually exists.

The comparison harness was a scratch file and is not committed. Its permanent
replacement is `adapters/filesystem.test.ts`, which validates all 43 real guides
through the pure validator on every run — the regression test for this phase's
gate.

##### Validation levels

`LEVEL_LAYERS` in `validation/index.ts` implements §5.3:

| level     | grammar | document | collection | render |
| --------- | ------- | -------- | ---------- | ------ |
| `draft`   | yes     |          |            |        |
| `preview` | yes     | yes      |            |        |
| `publish` | yes     | yes      | yes        | yes    |

Validation stops after grammar when grammar fails: later layers would otherwise
report about a tree that was never parsed. Layer 4 (render) lives in
`src/cms/server/validation.ts` rather than the pure module, because it has to
compile and execute the body — and only the publish path pays that cost.

`createCmsValidator()` is what Phase 2's deliberately-defaultless
`ContentValidator` argument was waiting for. Only `publish` reads the whole
collection out of the database; a draft save runs the grammar alone.

##### Two rules restated in lifecycle terms

- "links to a `noindex` guide" is now "links to a guide that is not published",
  which is the same condition once `noindex` became the `preview` status.
- `meta.preview`'s file-exists check is a _capability_ the caller supplies
  (`assetExists`), not something the validator assumes. The CLI passes one; a
  database validator has no filesystem to check against, so the rule is skipped
  rather than silently failing.

Two collection rules the old validator did not have, both stricter: a published
page may not canonicalize to an unpublished one, and canonical chains
(A → B → C) are rejected because search engines do not follow them.

##### Adapters

`documentsFromFilesystem()` resolves the three shape differences between the two
worlds: `meta.noindex` becomes the `preview` status, `meta.preview`/`meta.canonical`
become `previewImage`/`canonicalSlug`, and body imports are stripped.
`declaredImports()` enumerates what was stripped, and a test asserts the only
specifier present anywhere in the corpus is
`@/components/guides/InflacionChart` — the allowlist Phase 7 needs.

`documentsFromDatabase()` returns every state, unlike `ContentRepository`,
because a collection validator has to see drafts. `serializeSnapshot` /
`parseSnapshot` are the CI story from §5.2: after cutover, `validate:content`
can validate an exported snapshot without production database access.

Floor after Phase 4:

```text
build:            pass
lint:             pass — 0 errors, 0 warnings
typecheck:        pass
test:             pass — 59 files / 908 tests, 1 file skipped (no database)
test:db:          pass — 60 files / 927 tests
validate:content: pass — 63 files · 0 errors · 0 warnings, output byte-identical
                  to the pre-refactor baseline
```

### Phase 5 — Build the CMS content list and editor

- [ ] Implement the `/cms` section index from the section registry.
- [ ] Implement `/cms/[section]` list data and shared CMS-only list components.
- [ ] Add status filtering and title/slug search.
- [ ] Implement `/cms/[section]/new` with guide metadata fields and a safe
      initial draft.
- [ ] Make the metadata form section-driven so statistics and research can reuse
      it in section 12 without a second editor.
- [ ] Render the content list as the page tree (`buildContentTree`), with a
      parent picker and sibling ordering available in every section.
- [ ] Add CodeMirror 6 with Markdown/MDX highlighting, line numbers, search,
      matching, and lint support.
- [ ] Add Markdown, Preview, and Validation tabs.
- [ ] Add explicit Save and unsaved-change navigation protection.
- [ ] Display server diagnostics in the Validation tab.
- [ ] Map diagnostic line/column ranges into CodeMirror lint markers.
- [ ] Implement metadata form validation without exposing raw JSON.
- [ ] Implement save conflicts using `lock_version` and a clear reload/copy
      recovery path.
- [ ] Implement lifecycle controls and confirmation dialogs.
- [ ] Show propagation timing for published edits.
- [ ] Ensure the CMS UI is usable at desktop and tablet widths.
- [ ] Add keyboard-focus and screen-reader checks for editor controls and status
      transitions.

**Gate:** Both intended human editors can create and save a draft without
knowing React or JavaScript.

### Phase 6 — Implement exact previews

- [ ] Add `/cms/[section]/preview/[id]` as an authenticated, dynamic, no-store
      route, rendered outside the CMS chrome.
- [ ] Render the saved body through the same article shell and component
      manifest as the public guide.
- [ ] Ensure draft previews carry `noindex, nofollow` and no canonical URL.
- [ ] Add the Open Preview button and open the saved preview in a new tab.
- [ ] Add public rendering for `preview` status at its normal slug with
      `noindex, nofollow`.
- [ ] Prove preview content is absent from all list/discovery repository calls.
- [ ] Verify custom components, headings, TOC, FAQ, CTA, related-guide fallback,
      metadata, and structured data behavior in preview.

**Gate:** What the editor previews uses the same renderer as the eventual public
page; there is no separate approximate Markdown renderer.

### Phase 7 — Migrate guides and cut over public reads

- [ ] Write a repeatable, idempotent import script for guide MDX files.
- [ ] Make the importer default to the local database and refuse a production
      target unless an explicit production option and environment are supplied.
- [ ] Parse metadata into typed fields/JSONB.
- [ ] Remove allowed import declarations during migration only after verifying
      they correspond to a registered component; reject any unexpected import.
- [ ] Preserve slug, status/noindex mapping, timestamps, canonicals, categories,
      FAQ, OG data, preview image, and body exactly.
- [ ] Assign imported rows to a named CMS member and record migration provenance.
- [ ] Add a dry-run mode that reports changes without writing.
- [ ] Run dry-run, initial import, repeat import, and rollback/re-import tests
      against the local database.
- [ ] Add parity checks for document counts, slugs, metadata, headings, word
      counts, links, and validation diagnostics.
- [ ] Implement the cached PostgreSQL guide repository with one-hour TTL.
- [ ] Change the public guide article route to use the repository.
- [ ] Allow on-demand rendering for slugs not returned at build time.
- [ ] Change guide index, category pages, related guides, metadata, JSON-LD,
      sitemap, RSS, `llms.txt`, and OG routes to use published database guides.
- [ ] Ensure public-preview routes never emit indexable metadata or discovery
      links.
- [ ] Run old-filesystem versus database HTML comparisons on representative
      guides: plain prose, FAQ, chart, trust block, preview image, canonical, and
      noindex.
- [ ] Keep a documented feature flag or simple repository switch for rollback
      during the cutover.
- [ ] Remove filesystem guide reads only after parity and browser verification.
- [ ] Keep guide MDX files on `cms` as migration fixtures and rollback content;
      do not remove them before the branch-wide production migration, merge,
      deployment, and observation window.

**Gate:** Every previously public guide renders the same user-visible content,
metadata, structured data, and discovery behavior from PostgreSQL.

### Phase 8 — Add CMS MCP

- [ ] Add `cms_api_tokens` and token hashing/verification helpers.
- [ ] Add an admin-only `/cms/tokens` screen for create, list, and revoke.
- [ ] Show plaintext tokens once and never persist or log them.
- [ ] Add `/api/cms/mcp` with separate protected-resource identity, scopes, CORS,
      rate limiting, instructions, and tool registry.
- [ ] Implement `list_content` and `get_content` through the CMS service.
- [ ] Implement `create_content` with default `draft` status.
- [ ] Implement `update_content` with optimistic concurrency.
- [ ] Implement `validate_content` with structured diagnostics.
- [ ] Implement `set_content_status` through the shared transition service.
- [ ] Re-check membership, role, scope, expiry, and revocation on every call.
- [ ] Add mutation audit logs that exclude token values and content bodies.
- [ ] Add protocol, auth, scope, role, validation, conflict, rate-limit, and
      mutation tests.
- [ ] Verify a real MCP client can create, edit, validate, preview, and explicitly
      publish a test guide locally.
- [ ] Verify an ordinary Factura MCP token cannot discover or call CMS tools.

**Gate:** Browser and MCP mutations have identical authorization, validation,
and lifecycle semantics.

### Phase 9 — Final verification and handoff

- [ ] Run `bun run build` first.
- [ ] Run `bun run lint`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run validate:content` against the post-cutover source.
- [ ] Start PostgreSQL and the local dev server on port 4000.
- [ ] Sign in through the documented OTP flow as a manually authorized CMS
      member.
- [ ] Exercise draft, preview, publish, published edit, unpublish, conflict, and
      forbidden-user paths in the browser.
- [ ] Inspect desktop and tablet CMS layouts visually.
- [ ] Inspect representative public guides and their HTML metadata.
- [ ] Check sitemap, feed, `llms.txt`, categories, related guides, and OG routes.
- [ ] Confirm a new slug renders without a deployment.
- [ ] Confirm a draft returns 404 publicly and a preview emits `noindex`.
- [ ] Confirm every browser, migration, validation, and MCP verification above
      used the local database and no production credentials.
- [ ] Document production migration, backup, rollback, and manual CMS membership
      commands.
- [ ] Record intentionally deferred work in the long-term section below.

**Local implementation is complete only when every Phase 9 check passes.**

### Phase 10 — Guide milestone checkpoint on `cms`

This checkpoint finishes the guides implementation but does not touch
production and does not merge to `main`. Continue on the same `cms` branch with
the statistics/research work in section 12.

- [ ] Confirm Phases 0–9 are complete on local PostgreSQL.
- [ ] Rebase or merge the current `main` into `cms` as appropriate and resolve
      integration drift on `cms`.
- [ ] Re-run build, lint, typecheck, tests, content validation, import parity,
      browser verification, and MCP verification after synchronization.
- [ ] Confirm the current `main` branch remains unchanged by the CMS program.
- [ ] Confirm no production database command has been run.
- [ ] Tag or record the reviewed guide milestone commit in this document.
- [ ] Continue directly to section 12 on `cms`; do not open a guide-only merge.

**The guides milestone is complete when this checkpoint passes, but the `cms`
branch is not mergeable until section 12 and its branch-wide rollout pass.**

## 10. Testing strategy

### Unit tests

- Metadata schemas and normalization.
- Lifecycle policy.
- Authorization and scopes.
- Component manifest and property schemas.
- Restricted-MDX grammar.
- Document and collection validation.
- Cache/repository visibility semantics.
- Optimistic concurrency.
- Token hashing, expiry, and revocation.

### Integration tests

- CMS service with PostgreSQL test data.
- Browser and MCP calls reaching the same service.
- Import script idempotence and parity.
- Public repository merging database guides with filesystem sections.
- Metadata, sitemap, feed, `llms.txt`, and OG consumers.

### Runtime/browser verification

- Exact article preview with every custom component type.
- CMS access for member and non-member sessions.
- Editor diagnostics and unsaved-change warning.
- Public lifecycle behavior.
- New on-demand slug.
- One-hour cache behavior documented rather than assumed to be immediate.

## 11. Operations and recovery

- Use the local Postgres database freely for CMS schema development, imports,
  lifecycle tests, browser verification, and MCP verification. This is the
  expected workflow.
- Production is not a testing environment. It is first touched at the
  branch-wide production migration and merge gate in section 12, after every
  earlier task has passed locally and the rollout is explicitly authorized.
- Back up `cms_pages`, `cms_members`, and `cms_api_tokens` before production
  migration and before deleting repository MDX files.
- Keep the import script deterministic and safe to rerun.
- Keep repository feature switches during initial cutover so all content
  sections can fall back to filesystem content without a schema rollback.
- Never make production content validation depend on local source files after
  the final cutover.
- Do not connect local development or agent verification to the production
  database.
- Do not log MDX bodies, metadata payloads, session cookies, or API tokens.
- Add reasonable body-size, request-size, and rate limits to browser mutations
  and MCP calls.

## 12. Next content migration: statistics and research

After the guides-first CMS is stable, migrate `/estadisticas` and
`/investigacion` into the same simple, mutable-row CMS model **before** adding
revisions, history, immediate invalidation, or richer publishing workflow. The
goal is to put all MDX content behind one repository and publishing system
before making that system more sophisticated.

This is the next milestone after iteration 1, not part of the guide rollout,
but it is implemented on the same `cms` branch before that branch is merged.
It must follow the same local-first rule: implement, import, validate, and
visually verify against local PostgreSQL before the single branch-wide
production migration.

- [ ] Inventory and register the complete statistics/research chart, map, table,
      data, source, related-page, FAQ, subpage, and CTA component surface.
- [ ] Define component property schemas and section restrictions in the shared
      manifest.
- [ ] Replace per-MDX imports with manifest entries while preserving bundle and
      client-component behavior.
- [ ] Extend CMS metadata schemas/forms for hierarchy, crumbs, hubs, datasets,
      sources, OG statistics, and subpages.
- [x] Represent explicit editorial ordering and parent/child relationships in
      the database without deriving them from filenames.
      Done ahead of schedule and for every section — see §7.1. `parent_id`,
      `sort_order` and `crumb` landed with the Phase 2 schema; the rules and
      their tests are in `src/content-system/hierarchy.ts`.
- [x] Preserve the invariant that every intermediate path/hub exists and every
      breadcrumb target resolves.
      Enforced by `checkHierarchy` on every create and update, for all three
      sections rather than only the two with hubs.
- [ ] Extend pure document and collection validation for both sections.
- [ ] Extend the CMS editor, preview, list filters, and MCP schemas for these
      section-specific fields.
- [ ] Promote `estadisticas` and `investigacion` from `planned` to `live` in the
      section registry, and confirm no new route files were needed to do it.
- [ ] Write repeatable, idempotent, local-first importers with dry-run and target
      environment safeguards.
- [ ] Migrate both sections locally and compare document counts, metadata,
      headings, sources, datasets, links, hierarchy, validation, rendered HTML,
      charts, maps, JSON-LD, OG images, sitemap, feed, and `llms.txt`.
- [ ] Change the composite repository so all three MDX sections read from
      PostgreSQL while normativa remains unchanged.
- [ ] Remove the explicit TypeScript page registries only after hierarchy,
      ordering, build behavior, and rollback have database equivalents.
- [ ] Complete the full build/lint/typecheck/test/content-validation and browser
      verification floor locally.
- [ ] Confirm every implementation item before section 13 is committed on
      `cms`, reviewed, and complete against local PostgreSQL.
- [ ] Synchronize `cms` with the final intended `main` base and rerun the full
      build/lint/typecheck/test/content-validation floor.
- [ ] Re-run all guide/statistics/research imports from an empty local CMS and
      prove idempotence and complete rendering/discovery parity.

### Branch-wide production migration and merge gate

Run this gate only after all preceding section 12 tasks pass and the project
owner explicitly authorizes production rollout. Implementation work is not
implicit permission to modify production.

- [ ] Confirm the production database target and exact reviewed `cms` commit.
- [ ] Back up the affected production schema/tables and verify the recovery
      procedure before writes.
- [ ] Apply the reviewed additive CMS schema migration to production from
      `cms`.
- [ ] Add the initial production `cms_members` rows manually.
- [ ] Run all content importers in production dry-run mode and review counts,
      paths, metadata, hierarchy, and proposed writes.
- [ ] Import guides, statistics, and research into production.
- [ ] Run every importer again in dry-run/idempotence mode and confirm it
      proposes no unintended changes.
- [ ] Compare production CMS data with repository sources using the complete
      parity report proven locally.
- [ ] Confirm the still-running `main` deployment remains healthy and compatible
      with the newly populated additive tables.
- [ ] If any migration or parity check fails, stop and do not merge `cms`.
- [ ] Record the migration timestamp, operator, backup reference, source commit,
      imported row counts, and verification results in this document.
- [ ] Merge the verified `cms` branch into `main` only after all production data
      checks pass.
- [ ] Deploy merged `main` to perform the public content/CMS cutover.
- [ ] Verify representative guides, statistics, research, previews, CMS access,
      indexes, hierarchy, categories, sitemap, feed, `llms.txt`, metadata,
      JSON-LD, OG routes, charts, and maps in production.
- [ ] Verify one non-destructive CMS MCP read, then a controlled draft
      create/update/validate flow in production without publishing test content.
- [ ] Keep all source MDX and repository rollback switches throughout the
      observation window.
- [ ] Remove or archive the `cms` branch only after merge, deployment, production
      verification, and the observation window are complete.

**Gate:** Revisions and the advanced roadmap below do not begin until guides,
statistics, and research all use the simple database-backed CMS in production
and `cms` has been merged into `main`.

## 13. Deliberately deferred work

These are not iteration 1 requirements. Preserve clean extension points, but do
not partially implement them unless iteration 1 requires it.

### 13.1 Revisions and change history

Future data model:

```text
cms_pages
  id
  draft_revision_id
  published_revision_id
  ...stable identity/lifecycle fields

cms_page_revisions
  id
  page_id
  revision_number
  body_mdx
  metadata snapshot
  validation snapshot
  created_by
  created_at
```

Future capabilities:

- [ ] Preserve every save or every explicit checkpoint.
- [ ] Edit a draft while the previous published revision remains public.
- [ ] Preview unpublished changes to an already-published page safely.
- [ ] Show revision history and author/timestamp.
- [ ] Diff two revisions.
- [ ] Restore an older revision.
- [ ] Publish a chosen revision transactionally.
- [ ] Add MCP revision listing/restoration tools.

Migration path: backfill each current `cms_pages` row as revision 1, add draft
and published pointers, then change only repository/service internals. Stable
page UUIDs and the service boundary in iteration 1 make this feasible.

### 13.2 Audit/change event history

Iteration 1 records current creator/editor and operational mutation logs, but
does not promise a complete historical audit trail.

- [ ] Add durable `cms_events` records for create, update, status transition,
      token actions, restore, and slug changes.
- [ ] Expose filterable history in the CMS.
- [ ] Define retention and privacy policy.

### 13.3 On-demand cache and slug invalidation

- [ ] Add content-specific cache tags.
- [ ] Revalidate the article, old/new slug, indexes, categories, related content,
      sitemap, feed, `llms.txt`, and OG images on publication changes.
- [ ] Make publish/unpublish visible immediately.
- [ ] Invalidate cached 404s/new slugs explicitly if required by deployed cache
      behavior.
- [ ] Trigger IndexNow only after a successful publish transaction.

### 13.4 Slug changes and redirects

Slug edits are not supported after creation in iteration 1 unless the page has
never been published.

- [ ] Add a `cms_redirects` table.
- [ ] Preserve every previously published path.
- [ ] Validate redirect loops and collisions.
- [ ] Render permanent redirects from old slugs.
- [ ] Update internal links and discovery surfaces transactionally.

### 13.5 Media library

- [ ] Upload and manage images outside the repository.
- [ ] Add alt-text, dimensions, attribution, and usage references.
- [ ] Prevent deletion of referenced assets.
- [ ] Define storage backup and migration strategy.
- [ ] Reuse existing object-storage infrastructure only after separating public
      CMS assets from private bill storage permissions.

### 13.6 Richer editor experience

- [ ] Component-name and property autocomplete from the manifest.
- [ ] Insert-component palette with safe templates.
- [ ] Inline documentation for components and allowed values.
- [ ] Formatting toolbar and keyboard shortcuts.
- [ ] Side-by-side source/preview mode.
- [ ] Optional MDXEditor evaluation only after proving it preserves the exact
      restricted dialect; WYSIWYG remains nonessential.

### 13.7 Publishing workflow

- [ ] Scheduled publishing/unpublishing.
- [ ] Review/approval roles.
- [ ] Editorial comments.
- [ ] Content assignments.
- [ ] Bulk operations.
- [ ] Required second-person approval for agent-generated content.

### 13.8 Separate deployments and databases

Target extraction sequence:

1. Move `/app`, bill-domain server code, app UI, parsers, and app-only APIs to
   the `app.factura.uno` project.
2. Keep public landing, `src/content-system`, `src/cms`, CMS routes, public
   content APIs, sitemap/feed/OG, and content database at `factura.uno`.
3. Redirect `factura.uno/app` to `app.factura.uno`.
4. Replace the temporarily shared Auth.js adapter with a common identity
   provider or explicit cross-project SSO contract.
5. Split database ownership after identity is no longer implemented as an
   implicit local foreign key.

Deferred tasks:

- [ ] Define shared identity/SSO architecture.
- [ ] Decide which deployment owns login and account identity.
- [ ] Move CMS tables into a dedicated content database.
- [ ] Replace direct `users.id` foreign keys with stable external subject IDs or
      replicated CMS identities.
- [ ] Give each deployment independent database credentials and least privilege.
- [ ] Add cross-domain session, redirect, CORS, CSP, and cookie tests.
- [ ] Separate deployment pipelines and rollback procedures.

### 13.9 Additional deferred capabilities

- [ ] Content localization beyond the current Spanish-only guide model.
- [ ] Automatic link suggestions and SEO briefs.
- [ ] Content analytics inside the CMS.
- [ ] Full-text CMS search.
- [ ] Import/export formats beyond the one-time MDX migration.
- [ ] Soft-delete/archive UI and retention policy.
- [ ] Webhooks for external systems.
- [ ] Agent-generated media workflow.

## 14. Known iteration 1 limitations

- There is no revision history or rollback after overwriting a page.
- Editing a published page edits its only stored copy.
- A private saved preview is immediate, but the public copy changes on cache
  refresh and may do so sooner or later than an editor expects.
- Publish/unpublish and discovery changes are not immediately invalidated.
- A public preview URL is discoverability-controlled, not access-controlled.
- Guide images may still live in the repository until the media-library phase.
- Statistics and research remain coupled to source files.
- CMS and app still share Auth.js users and one physical database.
- Manual database changes are required to grant initial CMS membership.

## 15. Implementation notes and decisions log

Agents should append dated decisions here when implementation evidence requires
a change to this plan. Do not silently change architecture while marking the
original checkbox complete.

- 2026-08-18: Iteration 1 is guides-first and uses one mutable page row, a
  one-hour TTL, explicit saves, restricted MDX, and a separate CMS MCP endpoint.
- 2026-08-18: Revision history, immediate invalidation, post-publication slug
  changes, and media management are deferred until after all three MDX sections
  use the simple CMS.
- 2026-08-18: All development, migration rehearsal, and verification use local
  PostgreSQL. Production CMS migration is a separate, explicitly authorized
  branch-wide rollout only after all work through section 12 passes locally.
- 2026-08-18: Statistics and research migration is the next milestone after the
  guides rollout and precedes revisions and the advanced CMS roadmap.
- 2026-08-18: All work through section 12 is implemented and continuously
  validated on the long-lived `cms` branch. After complete local verification,
  production CMS data is migrated and verified from that branch; only then is
  `cms` merged into `main` and deployed for the public cutover.
- 2026-08-18: Phase 0 inventory found no guide components or metadata fields
  beyond those the plan names, but three consumers the checklist misses: the
  landing page's guide block, the `/normativa` slug→title map, and
  `scripts/validate-sections.ts`'s cross-section link check. All three are
  recorded under the Phase 0 gate and must move at the Phase 7 cutover.
- 2026-08-18: `meta.noindex` is not stored as metadata. It is the `preview`
  lifecycle state, and the importer maps it that way. No guide currently sets
  it, so all 43 import as `published`.
- 2026-08-18: Phase 1 landed with the table named `cms_member` (singular, per
  the project's schema convention), no Drizzle `relations()` call and no
  migration file — this project's schema workflow is `drizzle-kit push`. The
  production rollout in section 12 is therefore a reviewed `db:push` against a
  backed-up database, not a hand-written migration.
- 2026-08-18: `cms_page.created_by`/`updated_by` are nullable with
  `on delete set null`, not `not null` as §4.2 says. Accounts are hard deleted,
  and content must neither be deleted with its author nor block that deletion.
- 2026-08-18: The CMS content service takes its validator as a required
  dependency rather than importing one, so Phase 2 cannot ship a service that
  quietly permits everything. Phase 4 supplies the implementation.
- 2026-08-18: Repository and concurrency proofs run against local PostgreSQL
  via `bun run test:db` and are skipped in CI, which has no database. The test
  connection refuses any non-local host.
- 2026-08-18: Restricted MDX is an allowlist of manifest components, not a
  denylist of forbidden syntax. Raw HTML is rejected by the same rule as an
  unknown component, since a lowercase JSX name is an HTML element to MDX. All
  43 existing guide bodies pass unchanged.
- 2026-08-18: Manifest entries register the _bound_ form of a component
  (`TrustBlock` with its article margin, `Faq`/`RelatedGuides` as no-ops the
  article route overrides), so a database-rendered page is identical to the
  filesystem-rendered one.

- 2026-08-18: Phase 4 replaced the rules in `scripts/validate-guides.ts` rather
  than duplicating them; the script is now a thin filesystem adapter over
  `src/content-system/validation`, and `validate:content` output is
  byte-identical to the pre-refactor baseline.
- 2026-08-18: The only intentional behaviour change is that an unrecognized
  `meta` key is an error rather than a warning — a validated JSONB column cannot
  hold a key nothing reads, and the importer must not drop one silently.
- 2026-08-18: The component manifest is split into `definitions.ts` (rules, no
  React) and `manifest.tsx` (bindings), because the CLI validator cannot import
  the component tree without pulling in `server-only`.

- 2026-08-18: CMS routes are scoped by section (`/cms/[section]/…`) rather than
  a single combined list, decided before Phase 5 on the project owner's
  suggestion. Statistics and research carry hierarchy, datasets and sources that
  guides do not, so one list would need a per-row conditional form; and the URL
  is a better home for section scope than component state. Implemented as one
  dynamic route set driven by `src/cms/sections.ts`, so the forms, list and
  editor stay shared and a new section is a registry entry. The CMS segment is
  the section id, which makes `/cms/investigacion` differ from the public
  `/investigaciones`.

- 2026-08-18: The CMS URL segment mirrors the public path, not the section id,
  so `/cms/investigaciones` edits `/investigaciones`. `src/cms/sections.ts` is
  the only place the two names are reconciled.
- 2026-08-18: Hierarchy (`parent_id`, `sort_order`, `crumb`) is universal across
  sections rather than a statistics feature, on the principle that a capability
  one section needs first is one the others will want later — and that building
  it per section is how `if (section === "…")` gets into the list, the editor,
  the breadcrumb and the sitemap. Guides are flat today by content, not by
  model. See §7.1.

### Baseline results

Record Phase 0 command results here before implementation:

Recorded 2026-08-18 on `cms` at commit `5782f44`, against local PostgreSQL
(`docker compose` service `db`, `postgres:18-alpine`, host port 5433).

```text
build:            pass (exit 0) — Next.js production build, no errors
lint:             pass (exit 0) — eslint, no errors or warnings
typecheck:        pass (exit 0) — tsc --noEmit
test:             pass (exit 0) — vitest run, 48 files / 720 tests passed
validate:content: pass (exit 0) — 63 files · 0 errors · 0 warnings
                  (43 guías, 16 estadísticas, 4 investigación)
```

No pre-existing failures. Any failure appearing later in the program is a
regression introduced by CMS work, not inherited.
