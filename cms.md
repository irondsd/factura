# Factura CMS

> **Status:** built and reviewed on the `cms` branch. The production migration
> has not run and the branch has not been merged.
>
> A private, database-backed publishing console for `/guias`,
> `/estadisticas` and `/investigaciones`, with agent access through a separate
> CMS MCP endpoint.
>
> Sections 1–8 are the design reference: what the system is and why it is shaped
> that way. Section 9 says what exists and what does not. **Section 10 is a
> temporary migration checklist and should be deleted once it is done.** Section
> 12 is the forward work.

## 1. Objective

Move published content out of application source files and into PostgreSQL
without introducing a paid or separately hosted CMS. Editors create, edit,
validate, preview, publish and unpublish pages from `/cms`; authorized agents
perform the same operations through a separate MCP endpoint.

This is an internal publishing tool for two people, not a general-purpose CMS.
It deliberately keeps one mutable copy of each page and has no revision history
— see Task 2. A published edit becomes eligible for the public cache on save and
normally appears within the hour.

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

The repository `.mdx` sources and the section registries are still present as
migration input and rollback material. They are removed in §10.6, after the
observation window.

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
  one-hour cache window is accepted — see Task 4.
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
- There is no publish-time path or tag invalidation. Task 4.
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
  component: React.ComponentType<unknown>
  sections: readonly ContentSection[]
  kind: 'leaf' | 'container'
  props: z.ZodType
  description: string
}
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
- `preview_image`

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
section               text not null              # guias | estadisticas | investigacion
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
validateContentDocument(document, index, level)
validateContentCollection(documents)
buildContentIndex(documents)
```

Keep an adapter for:

```ts
documentsFromDatabase() // CMS and public site
```

After cutover, content validation belongs to the CMS publication workflow. CI
must not validate or snapshot the production corpus. Its production build uses
one deterministic in-memory fixture per section so rendering and discovery are
still exercised without database access or editorial coupling.

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
  getByPath(section: ContentSection, slug: string[]): Promise<ContentDocument | null>
  listPublished(section: ContentSection): Promise<ContentSummary[]>
  listPubliclyRenderable(section: ContentSection): Promise<ContentSummary[]>
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

## 9. State of the build

### 9.1 What was built

All of it, across phases 0–12 on the `cms` branch, then reviewed and fixed
before the merge gate. In one place, so nobody has to reconstruct it from the
commit log:

| Area               | What exists                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema             | `cms_member`, `cms_page`, `cms_api_token`, `cms_audit_log`, plus the `cms_role` and `cms_page_status` enums. Additive; nothing outside the CMS reads them.                |
| Authorization      | `src/cms/auth` — one gate (`requireCmsMember`), pure rules beside it (`policy.ts`), membership as an explicit allowlist with no self-service path.                        |
| Content service    | `src/cms/server/contentService.ts` — the single writer. Authority, validation level, optimistic concurrency and timestamps all decided here; the store only runs SQL.     |
| Restricted MDX     | Allowlist grammar validation (`validation/grammar.ts`) with compilation gated on it. No bypass flag.                                                                      |
| Component manifest | `content-system/components` — rules split from bindings so validation tools need no React. 67 components: 10 available to guides, 59 to statistics, 57 to research.     |
| Validation         | Four pure layers (grammar, document, collection, render) with per-level policy, shared by the CMS and the MCP.                                                   |
| Repository         | `ContentRepository` with the lifecycle rules in one module (`repository/visibility.ts`); cached public read models for guides and for the registry sections.              |
| CMS surface        | `/cms`, `/cms/[section]`, `/cms/[section]/new`, `/cms/[section]/[id]`, `/cms/[section]/preview/[id]`, `/cms/tokens` — one dynamic route set driven by a section registry. |
| Editor             | CodeMirror 6 source editing, section-driven metadata form, Markdown/preview/validation tabs, explicit save, conflict recovery that preserves the losing text.             |
| CMS MCP            | `/api/cms/mcp` with six tools over the same service, scoped tokens, membership re-checked per call, its own rate-limit bucket, metadata-only audit rows.                  |
| Importers          | Idempotent, local-first, refuse production without an explicit flag and a confirmation variable, validate before writing.                                                 |
| Parity             | `scripts/parity-content.ts` — rendered-HTML comparison between two deployments (§10 uses it).                                                                             |

Hierarchy (`parent_id`, `sort_order`, `crumb`) is universal across sections
rather than a statistics feature, and the section registry drives routes,
navigation and forms — so adding a section is a registry entry plus a metadata
schema, not another editor.

CI also builds one deterministic fixture per content section and checks those
pages across the sitemap, feed and `llms.txt`; editorial content is validated
by the CMS rather than this repository.

### 9.2 What was not done

Honest gaps, not oversights that were papered over. Each is either a §12 task or
a §10 migration step.

- **Rendered parity has never been run.** The script exists; the comparison
  itself happens in §10, and it is the step that matters most, because guides
  have no filesystem fallback left.
- **No rollback switch for guides.** Statistics and research fall back to their
  registry when the section has no CMS rows (`migrated()` in
  `src/content/section.ts`); guides do not — nothing imports
  `content/guias/guides` any more. Rollback for guides is redeploying the
  previous build.
- **Browser mutations are not audited.** `cms_audit_log` records MCP writes
  only, so the trail answers "what did the agent do" and not "who changed this
  page". Task 3.
- **The repository MDX and the section registries are still present**, by
  design, until the observation window closes. §10 removes them.

### 9.3 Known limitations

Accepted, and the reasons are in the sections above:

- One mutable copy per page. No revision history, no diffs, no restore.
- Publication and unpublication are visible within roughly an hour, not
  immediately, and the hour runs from when the cache entry was written rather
  than from a deploy.
- A page's slug cannot change after creation; there are no redirects.
- A public `preview` URL is a discoverability control, not an access control.
- Images live in the repository; there is no media library.
- The CMS and the bill app share Auth.js identity and one physical database.
- Initial CMS membership is granted by hand, in SQL. There is no path in.

## 10. Production migration — temporary

**Delete this section once every box is ticked.** It describes a one-time
operation, and leaving it here afterwards would make a finished migration look
pending.

The ordering is not a preference. A build against a database that has the CMS
tables but no rows serves **404 for every guide**, an empty `/guias`, 404 for
every category hub and zero guide entries in the sitemap — because guides read
only from the database now. Statistics and research survive on their registry
fallback. So the database is populated first and the merge happens last.

### 10.1 Before touching production

- [x] Capture what production renders today, while it still serves from `.mdx`.
      This window closes at the merge and cannot be reopened.

      ```bash
      bun run parity:capture --origin https://factura.uno --out .parity/before
      ```

- [x] Confirm the capture covers what it should — 72 pages today: 43 guides,
      15 statistics, 3 research, 8 category hubs and the 3 section indexes.
      A smaller number means the sitemap is missing something, and the parity
      check can only compare what it captured.
- [x] Decide which production account is the first CMS `admin`.
- [x] Confirm the deployment platform has `DATABASE_URL` available **at build
      time**. This is new: the build queries the database for
      `generateStaticParams`, and without it the build fails rather than
      shipping an empty site.

### 10.2 Production database

Safe while `main` is deployed: every object is new and the running code reads
none of them.

- [x] Take a Neon branch (name it, e.g. `pre-cms-<date>`) and a logical dump.
      Record the branch, the dump path, the source commit, the operator and the
      timestamp.

      ```bash
      pg_dump "$(grep -E '^DATABASE_URL=' .env.prod | cut -d= -f2- | tr -d '\"')" \
        -Fc -f ~/factura-prod-$(date +%Y%m%d-%H%M).dump
      ```

- [x] Push the schema. `.env.prod` already points at the **direct** Neon
      endpoint — the pooler URL beside it is commented out — which is what DDL
      wants, so the existing script is right as it stands. Do not pass
      `--force`: read the statements it prints first.

      ```bash
      bun run db:push:prod
      ```

- [x] Confirm the statements were only: `cms_role`, `cms_page_status`,
      `cms_member`, `cms_page`, `cms_api_token`, `cms_audit_log`. Anything
      touching an existing table means the schema has drifted — stop.
- [x] Grant the first membership.

      ```sql
      insert into cms_member (user_id, role)
      select id, 'admin' from users where email = 'you@example.com'
      on conflict (user_id) do update set role = excluded.role;
      ```

- [x] Dry-run both importers and read the counts. Expect 43 guides and 18
      statistics/research pages, all inserts.

      Use the `:prod` scripts. They load `.env.prod` and pass `--production`;
      the plain ones do neither, and **bun auto-loads `.env.local`** — so
      `bun run content:import:guides --production` reaches the *local* database
      and the importer refuses it with "`--production` cannot target a local
      database". That refusal is the guard working, not a bug.

      The two confirmation variables differ, and they stay out of the scripts on
      purpose: naming the environment is a convenience, confirming the write is
      a decision.

      ```bash
      export CMS_IMPORT_ACTOR_EMAIL=

      CMS_IMPORT_PRODUCTION_CONFIRM=IMPORT_GUIDES \
        bun run content:import:guides:prod --dry-run --explain

      CMS_IMPORT_PRODUCTION_CONFIRM=IMPORT_CONTENT \
        bun run content:import:sections:prod --dry-run --explain
      ```

- [x] Import both — the same two commands without `--dry-run --explain`.
- [x] Re-run both dry-runs. Each must report `0 insert/update`; anything else
      means the round trip changed something and is worth understanding before
      it becomes the live site.
- [x] Sanity-check the rows.

      ```sql
      select section, status, count(*) from cms_page group by 1,2 order by 1;
      -- expect estadisticas|published|15, guias|published|43,
      --        investigacion|published|3 — no drafts, no previews
      select count(*) from cms_page where body_mdx like ';%';  -- must be 0
      ```

- [x] Confirm the live site is still healthy. It should be: nothing reads these
      tables yet.

### 10.3 Verify the merged build against production data

- [x] Restore the dump into local PostgreSQL rather than pointing a dev server
      at production. The CMS is a write surface, and a stray save would edit
      live content before it is even live.

      ```bash
      createdb -h localhost -p 5433 -U factura factura_prodcopy
      pg_restore -h localhost -p 5433 -U factura -d factura_prodcopy ~/factura-prod-*.dump
      ```

- [x] Build and serve against it — a real build, not `dev`: prerendering and ISR
      are where the differences live.

      ```bash
      export DATABASE_URL=postgres://factura:factura@localhost:5433/factura_prodcopy
      rm -rf .next && bun run build && PORT=4100 npx next start
      ```

- [x] Run the parity comparison. It exits non-zero if anything differs.

      ```bash
      bun run parity:compare --before .parity/before --after http://localhost:4100
      ```

- [x] Read every diff it reports. Timestamps are already compared as instants
      and social-card `?v=` stamps are ignored, so a reported difference is a
      real difference.
- [x] Walk the surfaces by hand: `/guias` lists 43; a category hub resolves;
      sitemap, `feed.xml` and `llms.txt` carry the same URLs as production; a
      guide OG card renders; `/cms` opens for the admin and 404s otherwise.
- [x] If parity fails: fix on `cms`, re-import into production, and repeat.
      Production is still untouched, so this loop is free.

### 10.4 Merge and deploy

- [x] Merge `main` into `cms`, resolve any drift, and re-run the floor:
      `build`, `lint`, `typecheck`, `test`, `test:db`.
- [x] Merge `cms` into `main`.
- [x] Watch the deployment build. It reads production content now, so a failure
      here is the guardrail working — investigate rather than retry.
- [x] Smoke the live site: a guide, a category hub, a statistics page with a
      chart, a nested research page, the home page's guide block,
      `/normativa`, the sitemap's guide count, one OG card.
- [x] Open `/cms` in production, press _Revisar para publicar_ on one guide,
      confirm it reports clean, and close without saving.

Rollback, if needed: redeploy the previous build. The schema change is additive
and inert to the old code, so nothing about the database needs undoing.

### 10.5 Observation window

- [x] Keep the `.mdx` sources and section registries in place for the window.
      They are the importers' only input; if a content defect appears, the
      repair is to fix the extractor and re-import.
- [x] Publish one small edit and confirm it reaches the public site within the
      hour. That is the first real test of the TTL in production.
- [x] Request the OG card for a guide created _in the CMS_ (not one of the
      imported 43). Its fonts are read at request time now, and this is the
      first path that exercises it.
- [x] Watch Search Console for a coverage drop on `/guias/*`.
- [x] Let a week pass with no content regression.

### 10.6 Cleanup

- [x] Add the database-free CI fixture corpus before deleting the filesystem
      content, so builds still exercise every public content path.
- [ ] Delete the guide `.mdx` files, the statistics and research `.mdx` and
      their `pages.ts` registries, `src/content/guias/guides.ts`, and both
      importers.
- [ ] Note that emptying a section's `entries` also removes its
      `generateStaticParams` and the build-time hub assertion — pages then
      render on demand. Verify that deliberately.
- [ ] Delete `scripts/parity-content.ts` and the `.parity` capture, or keep the
      script if a future migration will want it.
- [ ] Delete this section.

## 11. Operations

- The local PostgreSQL database is the development and testing target. Use it
  freely: create tables, grant membership, import and re-import, exercise every
  lifecycle and MCP operation.
- Do not point local development, tests or agent verification at production.
  `src/cms/server/testDb.ts` refuses a non-local host, and both importers refuse
  one without an explicit flag and a confirmation variable.
- Both importers are idempotent and safe to rerun. They validate before writing.
- Back up before any production schema change. `.env.prod` points at the direct
  Neon endpoint rather than the pooler, which is what DDL wants.
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
restore between builds — so **a deploy does not flush them**. After repairing
content in the database, a rebuilt server can still serve the old copy until the
entry expires. The one-hour TTL runs from when the entry was written, not from
the deploy. Plan content fixes around the TTL, and clear `.next/cache` when
verifying locally.

## 12. Tasks

Ordered roughly by how much they are missed, not by size. Nothing here is
required for the migration in §10.

### Task 1 — CI content boundary

Resolved with one deterministic in-memory fixture per CMS section. CI builds
and prerenders those pages and verifies they appear in `sitemap.xml`,
`feed.xml`, and `llms.txt`. Production builds use PostgreSQL and the real CMS
corpus. No editorial snapshot is committed, and publishing never requires a
repository change.

### Task 2 — Revisions and change history

The CMS stores one mutable copy per page, which is why saving a published
page has to pass full publish validation: there is no previous revision to keep
serving.

- Preserve every save, or every explicit checkpoint.
- Edit a draft while the previous published revision stays public.
- Show history with author and timestamp; diff two revisions; restore one.
- Publish a chosen revision transactionally.
- Add MCP tools for listing and restoring revisions.

### Task 3 — Complete the audit trail

`cms_audit_log` exists and records MCP mutations only. Browser mutations write
nothing, so the trail cannot answer "who changed this page".

- Record browser mutations through the same path.
- Cover create, update, status transition, token mint and token revoke.
- Expose a filterable history in the CMS.
- Define retention and privacy policy.

### Task 4 — On-demand cache invalidation

Publication and unpublication currently wait for the TTL.

- Add content-specific cache tags.
- Revalidate the article, the indexes, the categories, related content, the
  sitemap, the feed and `llms.txt` on publish and unpublish.
- Invalidate cached 404s so a new slug appears immediately.
- Trigger IndexNow only after a successful publish transaction.

### Task 5 — Slug changes and redirects

A page's address is fixed at creation. The editor shows it read-only, because a
rename without redirects would 404 every inbound link.

- Add a `cms_redirects` table and preserve every previously published path.
- Validate redirect loops and collisions.
- Render permanent redirects from old slugs.
- Update internal links and discovery surfaces transactionally.
- Then make the slug field editable again.

### Task 6 — Media library

Images live in the repository and are referenced by path.

- Upload and manage images outside the repository.
- Alt text, dimensions, attribution, usage references.
- Prevent deletion of referenced assets.
- Reuse the existing object storage only after separating public content assets
  from private bill storage.

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
that would narrow it, and both are consulted at every call site.

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
