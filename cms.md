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
- The first production CMS database work happens only after the guide schema,
  importer, public renderer, and rollback path have all passed locally.
- Production guide migration is a deployment operation: back up, apply schema,
  dry-run import, import, verify parity, then cut over public reads.

The import tooling must make the target environment obvious in its output and
must require an explicit production flag/confirmation rather than silently
choosing production from ambient configuration.

## 3. Iteration 1 decisions

### 3.1 Content scope

- Migrate all `/guias` MDX documents to PostgreSQL.
- Keep `/estadisticas` and `/investigacion` filesystem-backed in iteration 1.
- Keep their public behavior unchanged.
- Make public discovery surfaces consume a combined repository so database
  guides and filesystem-backed sections can coexist.
- Do not delete the guide MDX files until migration parity and rollback have
  been verified. Remove them in a final, explicit cutover task.

### 3.2 Lifecycle

Each page has exactly one of these states:

| Status | CMS | Direct public URL | Search/list discovery |
| --- | --- | --- | --- |
| `draft` | visible | 404 | excluded |
| `preview` | visible | rendered with `noindex, nofollow` | excluded |
| `published` | visible | rendered normally | included |

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
lock_version          integer not null default 1
created_by            uuid not null, FK users.id
updated_by            uuid not null, FK users.id
created_at            timestamptz not null
updated_at             timestamptz not null
published_at          timestamptz nullable
content_updated_at    timestamptz not null
unique(section, slug)
```

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
validateContentDocument(document, index, level)
validateContentCollection(documents)
buildContentIndex(documents)
```

Keep adapters for:

```ts
documentsFromFilesystem()  // CI and migration comparison
documentsFromDatabase()    // CMS and public site
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
  getByPath(section: ContentSection, slug: string[]): Promise<ContentDocument | null>;
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

Iteration 1 routes:

```text
/cms                         content list/dashboard
/cms/new                     create guide
/cms/[id]                    metadata + Markdown editor
/cms/preview/[id]            exact private saved preview
/cms/tokens                  CMS MCP token management (admin only)
```

Required behavior:

- `/cms` is excluded from the locale proxy rewrite.
- `(cms)` has an independent root layout with private/noindex metadata.
- Anonymous users are redirected to `/login` with a safe callback URL.
- Signed-in non-members receive 404 or a plain forbidden screen; do not reveal
  editor data.
- CMS navigation and layout use only `src/cms/components`.
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

- [ ] Start and verify the local Postgres service with `docker compose`; record
      that all CMS development and testing will target the local database.
- [ ] Run `bun run build`, `bun run lint`, `bun run typecheck`, and `bun run test`
      before implementation and record any pre-existing failures below.
- [ ] Run `bun run validate:content` and save the baseline count of errors and
      warnings.
- [ ] Inventory every guide metadata field and record whether it maps to a
      dedicated column or JSONB.
- [ ] Inventory every guide custom component, its properties, children rules,
      and allowed values.
- [ ] Inventory every consumer of guide content: article route, index,
      categories, related guides, metadata, JSON-LD, sitemap, RSS, `llms.txt`,
      OG images, validation, and IndexNow.
- [ ] Add a short implementation note here for any consumer or component missed
      by this plan.

**Gate:** No schema or route work begins until the content and consumer
inventories are complete.

### Phase 1 — Establish isolated CMS shell and authorization

- [ ] Add `cms_role` and `cms_page_status` database enums.
- [ ] Add the `cms_members` table.
- [ ] Add Drizzle relations and migrations using the project's normal schema
      workflow.
- [ ] Create `src/cms/auth/requireCmsMember.ts` (or equivalent) as the only CMS
      role-checking entry point.
- [ ] Add unit tests for anonymous, non-member, editor, removed-member, and admin
      authorization outcomes.
- [ ] Create the independent `src/app/(cms)/layout.tsx` root layout.
- [ ] Create the `/cms` route and minimal CMS-only shell under
      `src/cms/components`.
- [ ] Add private/noindex metadata for every CMS route.
- [ ] Exclude `cms` from `src/proxy.ts` locale rewriting.
- [ ] Verify `/cms` redirects anonymous users, rejects signed-in non-members,
      and renders for a manually inserted member.
- [ ] Confirm no `src/cms` file imports from `src/components/app` or app-domain
      routers.

**Gate:** Authorization is enforced server-side, not only by hidden navigation.

### Phase 2 — Add content schema and repository contracts

- [ ] Add the `cms_pages` table, unique constraint, timestamps, authorship, and
      `lock_version`.
- [ ] Define `ContentDocument`, `ContentSummary`, lifecycle, metadata, and
      diagnostic types in `src/content-system/types.ts`.
- [ ] Define the shared Zod guide metadata schema.
- [ ] Implement the public `ContentRepository` contract.
- [ ] Implement the authenticated CMS repository/service contract.
- [ ] Add repository tests for every lifecycle visibility rule.
- [ ] Add optimistic concurrency tests proving stale saves cannot overwrite a
      newer save.
- [ ] Ensure callers outside repository/service modules do not query
      `cms_pages` directly.

**Gate:** Lifecycle behavior is proven at the repository layer before UI work.

### Phase 3 — Build the restricted MDX and component system

- [ ] Create the typed content component manifest.
- [ ] Register every guide component and its Zod property schema.
- [ ] Move `InflacionChart` resolution out of per-document imports and into the
      manifest.
- [ ] Implement AST-based restricted-MDX grammar validation.
- [ ] Reject imports, exports, expressions, functions, event handlers, spreads,
      scripts, unknown components, and invalid properties.
- [ ] Return stable diagnostic codes plus severity, message, line, and column.
- [ ] Implement rendering from a database string only after grammar validation.
- [ ] Preserve `remark-gfm` and heading-slug behavior used by current pages.
- [ ] Add tests for every allowed component.
- [ ] Add tests for every forbidden syntax category.
- [ ] Add tests for malformed/nested tags and invalid component properties.
- [ ] Add a test proving forbidden content cannot reach compilation/evaluation.

**Gate:** Database content cannot execute arbitrary JavaScript.

### Phase 4 — Refactor validation without losing CI coverage

- [ ] Extract pure metadata and document validators from
      `scripts/validate-guides.ts`.
- [ ] Extract pure cross-document validation from the current scripts.
- [ ] Implement filesystem and database/snapshot adapters.
- [ ] Preserve existing validator messages where practical so migration diffs
      remain understandable.
- [ ] Add validation levels for draft save, preview, publish, and published save.
- [ ] Add deterministic validator tests using in-memory documents.
- [ ] Keep `bun run validate:content` operational during the transition.
- [ ] Compare old and new validation reports over all existing guides and
      resolve unexplained differences.

**Gate:** Existing guides receive equivalent or stricter validation under the
new pure validator.

### Phase 5 — Build the CMS content list and editor

- [ ] Implement `/cms` list data and CMS-only list components.
- [ ] Add status filtering and title/slug search.
- [ ] Implement `/cms/new` with guide metadata fields and a safe initial draft.
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

- [ ] Add `/cms/preview/[id]` as an authenticated, dynamic, no-store route.
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
- [ ] Remove guide MDX files in a dedicated final change after the database
      backup/import has been verified in the target environment.

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

### Phase 10 — Production guide migration and cutover

Run this phase only after Phase 9 passes and the project owner explicitly
authorizes production deployment. Agents must not treat implementation work as
implicit permission to modify production.

- [ ] Confirm the production database target and deployment commit/version.
- [ ] Back up the affected production schema/tables and verify the recovery
      procedure before writes.
- [ ] Apply the reviewed CMS schema migration to production.
- [ ] Add the initial production `cms_members` rows manually and verify access.
- [ ] Run the guide importer in production dry-run mode and review counts,
      slugs, metadata, and proposed writes.
- [ ] Run the production guide import once.
- [ ] Run the import again in dry-run/idempotence mode and confirm it proposes no
      unintended changes.
- [ ] Compare production database documents with the repository source using the
      same parity report proven locally.
- [ ] Cut public guide reads over using the documented feature switch/deployment.
- [ ] Verify representative public guides, preview behavior, indexes, category
      pages, sitemap, feed, `llms.txt`, metadata, JSON-LD, and OG routes against
      production.
- [ ] Verify CMS browser access and one non-destructive CMS MCP read against
      production.
- [ ] Keep repository MDX and the rollback switch until the production
      observation window is complete.
- [ ] Record the migration timestamp, operator, backup reference, imported row
      count, verification results, and any deviations in this document.

**Iteration 1 production rollout is complete only when Phase 10 passes.**

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
- Production is not a testing environment. It is first touched in Phase 10,
  after the complete guide migration and cutover path has passed locally.
- Back up `cms_pages`, `cms_members`, and `cms_api_tokens` before production
  migration and before deleting repository MDX files.
- Keep the import script deterministic and safe to rerun.
- Keep a repository feature switch during initial cutover so guides can fall
  back to filesystem content without a schema rollback.
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

This is the next milestone after iteration 1, not part of the guide rollout.
It must follow the same local-first rule: implement, import, validate, and
visually verify against local PostgreSQL before a separately authorized
production migration.

- [ ] Inventory and register the complete statistics/research chart, map, table,
      data, source, related-page, FAQ, subpage, and CTA component surface.
- [ ] Define component property schemas and section restrictions in the shared
      manifest.
- [ ] Replace per-MDX imports with manifest entries while preserving bundle and
      client-component behavior.
- [ ] Extend CMS metadata schemas/forms for hierarchy, crumbs, hubs, datasets,
      sources, OG statistics, and subpages.
- [ ] Represent explicit editorial ordering and parent/child relationships in
      the database without deriving them from filenames.
- [ ] Preserve the invariant that every intermediate path/hub exists and every
      breadcrumb target resolves.
- [ ] Extend pure document and collection validation for both sections.
- [ ] Extend the CMS editor, preview, list filters, and MCP schemas for these
      section-specific fields.
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
- [ ] Prepare and execute a separately authorized production backup, schema
      migration, dry run, import, parity check, cutover, and observation window.
- [ ] Keep source files and rollback switches until production verification is
      complete.

**Gate:** Revisions and the advanced roadmap below do not begin until guides,
statistics, and research all use the simple database-backed CMS in production.

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
  PostgreSQL. Production guide migration is a separate, explicitly authorized
  rollout after local Phase 9 completion.
- 2026-08-18: Statistics and research migration is the next milestone after the
  guides rollout and precedes revisions and the advanced CMS roadmap.

### Baseline results

Record Phase 0 command results here before implementation:

```text
build:
lint:
typecheck:
test:
validate:content:
```
