import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Every timestamp column in this file is `timestamptz` (`withTimezone: true`),
 * and new ones must be too.
 *
 * A bare `timestamp()` is `timestamp without time zone`, and with postgres.js
 * that makes reads and writes disagree. Drizzle writes a JS Date as its ISO
 * string, so UTC lands in the column, and `defaultNow()` writes DB-side UTC as
 * well — but on the way back postgres.js builds a Date by reading those naive
 * digits in the *client process's* zone. (Drizzle's own fix-up appends "+0000"
 * only when the driver returns a string; postgres.js returns a Date, so nothing
 * corrects it.) Net effect: every value read back on a non-UTC host is off by
 * that host's offset — invisible in production on a UTC box, wrong on every dev
 * machine outside UTC.
 *
 * That isn't only cosmetic. Anything compared against `Date.now()` is wrong by
 * the same offset: session and OTP expiry (`session.expires`,
 * `verification_token.expires`), and both windows over
 * `bill_submissions.created_at` — the per-IP daily cap and the retention
 * sweep's cutoff, which deletes files and is run from a developer's shell
 * against prod.
 *
 * `timestamptz` stores an instant rather than a zone, so the round-trip is
 * unambiguous in both directions no matter where the client runs. */
export const billStatus = pgEnum("bill_status", ["parsed", "needs_review"]);

export const memberRole = pgEnum("member_role", ["owner", "member"]);

// Trust tier shown in the parser library. `official` is the platform-maintained
// set (ownerless rows, auto-adopted on sign-up); `verified` is a vetted
// community parser (grantable out of band); `community` is the default.
export const parserTier = pgEnum("parser_tier", [
  "official",
  "verified",
  "community",
]);

// Keep in sync with `locales` in src/i18n/config.ts. Spanish is the default.
export const userLocale = pgEnum("user_locale", ["es", "en"]);

// ── CMS ─────────────────────────────────────────────────────────────────────
// Everything CMS carries a `cms_` prefix so the whole publishing schema can be
// identified and lifted into its own database later (see cms.md §2.2/§13.8).
// It is deliberately additive: nothing in the bill app reads these tables, and
// a deployment that has them but never writes to them behaves exactly as it did
// before.

/** CMS membership role. `editor` and `admin` may both author; only `admin` may
 * manage CMS API tokens. Whether publishing is admin-only is a policy decision
 * that lives in `src/cms/auth`, not in this enum — see `canPublish`. */
export const cmsRole = pgEnum("cms_role", ["admin", "editor"]);

/** Publication state of one CMS page. `draft` is CMS-only and 404s publicly;
 * `preview` renders at its public URL with `noindex, nofollow` but is excluded
 * from every listing; `published` is fully public. The existing guides'
 * `meta.noindex` maps onto `preview` at migration time. */
export const cmsPageStatus = pgEnum("cms_page_status", [
  "draft",
  "preview",
  "published",
]);

// ── Auth.js (NextAuth) tables ───────────────────────────────────────────────
// Column *property* names (id, emailVerified, userId, …) must match what the
// @auth/drizzle-adapter reads; the DB column names stay snake_case to match the
// rest of the schema. The adapter omits `id` on insert when it has a default.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", {
    mode: "date",
    withTimezone: true,
  }),
  image: text("image"),
  // Preferred language. Source of truth for server-sent emails, which can't
  // read the client locale cookie. Defaults to Spanish for existing rows.
  locale: userLocale("locale").notNull().default("es"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authAccounts = pgTable(
  "auth_account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// The adapter only ever writes sessionToken/userId/expires; everything below is
// ours, filled in around it (see src/server/auth.ts) so the sessions page can
// describe a session without the token ever leaving the server.
export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  // Public handle for a session. The token is the credential — it must never
  // reach the client — so the sessions list and its revoke button address rows
  // by this id instead.
  id: uuid("id").notNull().defaultRandom().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // `withTimezone` on all three, unlike the rest of the schema, because these
  // are the only timestamps the app compares against the *server's* clock
  // (`Date.now()` in the heartbeat) rather than against each other.
  //
  // A bare `timestamp` is stored naive: postgres.js hands back a Date built by
  // reading that naive value in the CLIENT's timezone, while both `now()` and
  // drizzle's own writes put UTC in it. On a UTC host the two agree and nothing
  // shows; anywhere else — every dev machine outside UTC — every reading comes
  // back shifted by the local offset, which is enough to stall the heartbeat
  // for the length of that offset. `timestamptz` stores an absolute instant, so
  // the round trip is exact wherever the process runs.
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  // Where the session was signed in from, and where it was last seen. All of
  // these are refreshed on the throttled heartbeat, so a session that moves
  // networks shows where it is now rather than where it was born.
  userAgent: text("user_agent"),
  ip: text("ip"),
  // City and ISO country code, read off the CDN's geolocation headers — the
  // country stays a code so the UI can name it in the reader's language.
  city: text("city"),
  country: text("country"),
  // The surface the session was last used from: a raw CSS display-mode keyword
  // ("browser", "standalone", …), or null from a client that never reported.
  displayMode: text("display_mode"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── Domain tables ───────────────────────────────────────────────────────────
// A property (property) is the unit of sharing. `userId` is the original
// creator (informational); access is governed entirely by `propertyMembers`.
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  nickname: text("nickname").notNull(),
  // Full postal address (street + number …). Used in emails and as the address
  // match hint at ingest. Replaced the old `address_variants` array — bills link
  // to a property via the vendor account, so a single address is enough.
  address: text("address").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Who can access an property and at what level. The owner is just a row with
 * role='owner'. This is the single source of truth for authorization — every
 * domain query scopes to the set of properties the caller is a member of. */
export const propertyMembers = pgTable(
  "property_members",
  {
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.userId] })],
);

/** Pending invitations, claimed when the invitee next signs in with a matching
 * Google email (no token needed — email match is the claim). Row present =
 * pending; deleted on accept or revoke. */
export const propertyInvites = pgTable(
  "property_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").notNull().default("member"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("property_invite_email_idx").on(t.propertyId, t.email)],
);

// Vendors belong to an property (per-property display name/colour), not a user.
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    // A color *name* from the vendor palette (see lib/vendorColors). Assigned
    // randomly on creation, user-editable. Hex values live in CSS, not here.
    color: text("color").notNull().default("taupe"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("vendor_property_slug_idx").on(t.propertyId, t.slug)],
);

/** Other slugs that mean this vendor, inside this property.
 *
 * A parser's `vendor.slug` is how a bill's biller is *proposed*; the vendor row
 * is who the household actually banks with. Those two drifted apart every time
 * the winning parser changed — adopting the official parser over a private copy,
 * an upgrade that renames the vendor, a fork with its own slug — and
 * `ensureVendor` dutifully created a second vendor in the same property, which
 * split the bills page into two chips and every chart into two series.
 *
 * A row here says "slug X also resolves to vendor V here", so the property (not
 * the parser) owns the mapping. Two ways one appears: a merge folds the source
 * vendor's slug in, and a reparse that keeps an already-filed bill on its
 * existing vendor records the new parser's slug. Either way the effect is
 * durable — the *reason* a deleted vendor used to come back is that a full
 * reparse re-runs the old parser, which still emits the old slug; with an alias
 * that slug now lands on the surviving row instead of resurrecting the dead one.
 *
 * Unique on (propertyId, slug): a slug resolves to at most one vendor per
 * property. Resolution checks canonical slugs first, so an alias can never
 * shadow a real vendor even if a stale row survives. */
export const vendorAliases = pgTable(
  "vendor_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    // Denormalized from the vendor so the uniqueness that matters — one slug,
    // one vendor, per property — is a DB constraint rather than a convention,
    // and so resolution is a single indexed lookup with no join.
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("vendor_alias_property_slug_idx").on(t.propertyId, t.slug),
  ],
);

export const vendorAccounts = pgTable(
  "vendor_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    accountNumber: text("account_number").notNull(),
    label: text("label"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("vendor_account_number_idx").on(t.vendorId, t.accountNumber),
  ],
);

/** Daily ARS->USD blue rates from api.argentinadatos.com, fetched once and
 * kept current; bills are converted at the rate nearest their due date. */
export const fxRates = pgTable("fx_rates", {
  date: date("date").primaryKey(),
  compra: numeric("compra", { precision: 12, scale: 2 }),
  venta: numeric("venta", { precision: 12, scale: 2 }).notNull(),
});

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Who uploaded the bill. Access is by property membership, not this column;
    // an unfiled bill (propertyId null) is visible only to its creator's inbox.
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    accountId: uuid("account_id").references(() => vendorAccounts.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    propertyId: uuid("property_id").references(() => properties.id),
    period: date("period"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("ARS"),
    dueDate: date("due_date"),
    status: billStatus("status").notNull().default("needs_review"),
    fileName: text("file_name"),
    /** S3 object key of the stored original PDF (null = text-only / no upload). */
    storageKey: text("storage_key"),
    rawText: text("raw_text").notNull(),
    textHash: text("text_hash").notNull(),
    parserKey: text("parser_key"),
    parserVersion: numeric("parser_version"),
    extra: jsonb("extra").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Dedup is per-property once a bill is filed (either member re-uploading the
  // same bill collapses), and per-uploader while it sits unfiled in the inbox.
  (t) => [
    uniqueIndex("bill_property_text_hash_idx")
      .on(t.propertyId, t.textHash)
      .where(sql`${t.propertyId} is not null`),
    uniqueIndex("bill_inbox_text_hash_idx")
      .on(t.createdBy, t.textHash)
      .where(sql`${t.propertyId} is null`),
  ],
);

/** Which estimator produced a forecast. `none` (no history at all) is absent by
 * construction: there is nothing to store when there was nothing to predict. */
export const forecastBasis = pgEnum("forecast_basis", [
  "carry",
  "baseline",
  "yoy",
]);

export const forecastConfidence = pgEnum("forecast_confidence", [
  "low",
  "medium",
  "high",
]);

/** What we told the user a bill would come in at, frozen at the moment we first
 * told them. One row per (account, period).
 *
 * This table has exactly one consumer: the "+12% vs expected" readout. It has
 * NO analytical role — model evaluation and band calibration recompute from
 * `bills` instead, because the forecaster is pure and takes its target month as
 * an argument, so any past prediction is reproducible on demand. Keeping those
 * two jobs apart is what makes the rules here simple:
 *
 *  - The first forecast for a period is frozen; recomputes never overwrite it.
 *    Otherwise the over/under would compare against a figure revised with
 *    hindsight, and the model would grade its own homework.
 *  - Periods before this feature shipped stay empty and are NOT backfilled. We
 *    didn't predict them, so there is no over/under to show.
 *  - A formula change never rewrites existing rows. A row is a historical fact
 *    ("on 2026-08-01 we said ≈$613k"), not an opinion to be updated — hence no
 *    model-version column.
 *
 * A row is only ever written for an account that had NOT yet billed that period.
 * "Predicting" a bill already sitting in the history isn't a prediction. */
export const forecasts = pgTable(
  "forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => vendorAccounts.id, { onDelete: "cascade" }),
    /** The month's first day, matching `bills.period`. */
    period: date("period").notNull(),
    pointArs: numeric("point_ars", { precision: 12, scale: 2 }).notNull(),
    lowArs: numeric("low_ars", { precision: 12, scale: 2 }).notNull(),
    highArs: numeric("high_ars", { precision: 12, scale: 2 }).notNull(),
    basis: forecastBasis("basis").notNull(),
    confidence: forecastConfidence("confidence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Unique, so the insert itself is the concurrency guard — two tabs opening the
  // overview at once can't both write. Same trick as `monthly_reports`.
  (t) => [uniqueIndex("forecast_account_period_idx").on(t.accountId, t.period)],
);

/** Once-per-(property, month) log of the monthly closing report. A row exists
 * iff the report for that property+period has been sent; the unique index makes
 * the insert itself the concurrency guard, so two bills completing a month at
 * once can't both fire the email. `period` is the month's first day (date). */
export const monthlyReports = pgTable(
  "monthly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    period: date("period").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("monthly_report_property_period_idx").on(
      t.propertyId,
      t.period,
    ),
  ],
);

/** A parser "package": one owner's mutable working copy (`body` = the engine
 * definition draft) plus its identity. Detection is no longer global — a user
 * only ever runs their OWN packages plus the published versions they've adopted
 * (see `parserAdoptions`), so a careless or hostile package can't affect anyone
 * who hasn't deliberately adopted it. Only the owner may edit. `tier` places the
 * package in the library: `official` rows are platform-maintained and ownerless
 * (`ownerId` null) — they carry no editor and every new user auto-adopts them.
 * `version` is a monotonic draft revision (bumped on every edit) that drives the
 * owner's own reparse; published snapshots live in `parserVersions`. The
 * remaining columns are catalog metadata surfaced by the parser library. */
export const parserConfigs = pgTable(
  "parser_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null for official/platform parsers, which have no human editor.
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    version: integer("version").notNull().default(1),
    vendorSlug: text("vendor_slug").notNull(),
    displayName: text("display_name").notNull(),
    body: jsonb("body").notNull(),
    tier: parserTier("tier").notNull().default("community"),
    // Catalog metadata (see src/parsers/categories.ts for the category keys).
    category: text("category"),
    region: text("region"),
    provider: text("provider"),
    compat: text("compat"),
    // Label of the parser this was forked from, e.g. "Edesur v4".
    forkedFrom: text("forked_from"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Slugs are namespaced per owner: two users may each have an "edesur" (e.g. a
  // fork). `bills.parserKey` stays unambiguous because a user can't adopt two
  // packages with the same slug (enforced in adoptPackage).
  (t) => [uniqueIndex("parser_config_owner_slug_idx").on(t.ownerId, t.slug)],
);

/** Immutable published snapshot of a package. Publishing freezes the owner's
 * current draft (full engine ParserConfig incl. metadata) into `config` so
 * adopters keep running exactly what they pinned even after the owner keeps
 * editing or unpublishes. `version` mirrors the package's draft revision at
 * publish time, so a newer publish always has a higher number — that's what
 * makes an adopter's upgrade reparse their bills. */
export const parserVersions = pgTable(
  "parser_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configId: uuid("config_id")
      .notNull()
      .references(() => parserConfigs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    // Optional changelog line entered at publish time; shown in the library's
    // per-parser version history.
    note: text("note"),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("parser_version_config_idx").on(t.configId, t.version)],
);

/** One user's up/down vote on a published parser package (not a version). Drives
 * the library's rating widget and "most liked" sort. A missing row = no vote;
 * changing your mind updates `value`; clearing it deletes the row. */
export const parserVotes = pgTable(
  "parser_votes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    configId: uuid("config_id")
      .notNull()
      .references(() => parserConfigs.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 or -1
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.configId] })],
);

/** Which published version each user runs for a given package. Adoption is the
 * opt-in boundary: a package only enters a user's detection set once they adopt
 * it. The pinned `versionId` never changes silently — upgrading is an explicit
 * re-adopt of a newer version. */
export const parserAdoptions = pgTable(
  "parser_adoptions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    configId: uuid("config_id")
      .notNull()
      .references(() => parserConfigs.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => parserVersions.id, { onDelete: "cascade" }),
    adoptedAt: timestamp("adopted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.configId] })],
);

/** Bills the user has attached to a parser preset (by slug) as regression
 * samples in the builder — re-tested when the parser is later edited. Per-user
 * (not app-wide) so bill text, which is personal data, never crosses users. */
export const parserSamples = pgTable(
  "parser_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    fileName: text("file_name"),
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("parser_sample_slug_idx").on(t.userId, t.slug)],
);

/** Terminal state of a public submission's tier cascade. `pending` is the state
 * between upload and the first parse step; `no_text` is a scanned/image PDF we
 * couldn't read at all. Mirrors IngestResult's vocabulary minus the outcomes
 * that only mean something once a bill has an owner (duplicate,
 * unknown_account) — those are decided later, when the submission is claimed. */
export const submissionOutcome = pgEnum("submission_outcome", [
  "pending",
  "no_text",
  "unrecognized",
  "parse_failed",
  "parsed",
]);

/** One anonymous drop on the public /probar page. This is the only table a
 * logged-out visitor can write to, so it is deliberately self-contained: it has
 * no foreign key into `properties` or `property_members`, grants access to
 * nothing, and cannot become a bill on its own. A submission turns into a real
 * bill only when the visitor signs in and claims it — and claiming re-runs the
 * normal `ingestBill` under that user's own parser set, so nothing the public
 * cascade matched is trusted into an account on the cascade's say-so. */
export const billSubmissions = pgTable(
  "bill_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Capability ───────────────────────────────────────────────────────────
    /** SHA-256 of the per-submission secret handed to the browser in the
     * `probar_subs` cookie. The id alone is NOT authorization: uuids leak
     * through logs, Referer headers and shared screenshots, and a leaked one
     * must not let anyone read this bill's text or claim it into their account.
     * A cookie of bare ids would be no better — httpOnly stops a script
     * *reading* a cookie, not a client *forging* one. Stored hashed so a DB dump
     * isn't a pile of usable bearer tokens. */
    secretHash: text("secret_hash").notNull(),

    // ── File ─────────────────────────────────────────────────────────────────
    fileName: text("file_name").notNull(),
    fileBytes: integer("file_bytes").notNull(),
    pageCount: integer("page_count"),
    /** S3 key under `submissions/<id>/`. Null means no object exists for this
     * row: storage wasn't configured, the retention sweep removed it, or a claim
     * TRANSFERRED it to `bills.storage_key`. Transfer rather than share, because
     * `bills.delete` calls `deleteObject` — a key held by two rows would leave
     * this one pointing at nothing. */
    storageKey: text("storage_key"),
    /** When the sweep removed the object. Informational; the live "is there a
     * file?" test is `storage_key is not null`. */
    fileDeletedAt: timestamp("file_deleted_at", { withTimezone: true }),
    /** The "keep my file" checkbox, checked by default. False AND never claimed
     * ⇒ the sweep deletes the S3 object after SUBMISSION_FILE_GRACE_DAYS.
     * Claiming keeps the file regardless — saving a bill to your account is
     * asking us to hold it. This flag wins unconditionally, including for
     * unrecognized bills: a checkbox that doesn't delete the file is a lie, and
     * the extracted text below (the part that's useful for building a parser) is
     * kept either way. */
    keepFile: boolean("keep_file").notNull().default(true),

    // ── Extraction & parse ───────────────────────────────────────────────────
    rawText: text("raw_text").notNull(),
    textHash: text("text_hash").notNull(),
    outcome: submissionOutcome("outcome").notNull().default("pending"),
    /** Which cascade step produced `result`. Frozen here rather than read back
     * off parser_configs, because a parser's tier changes underneath us
     * (makeParserOfficial promotes rows in place) and this row has to keep
     * explaining what the visitor was actually shown. */
    matchedTier: parserTier("matched_tier"),
    matchedConfigId: uuid("matched_config_id").references(
      () => parserConfigs.id,
      { onDelete: "set null" },
    ),
    /** The exact published snapshot that matched. Claim adopts THIS version, so
     * the bill the user ends up with is parsed by the parser they watched work. */
    matchedVersionId: uuid("matched_version_id").references(
      () => parserVersions.id,
      { onDelete: "set null" },
    ),
    /** Slug + vendor name copied at match time, so the row stays readable after
     * the parser is unpublished or its owner's account is deleted. */
    matchedSlug: text("matched_slug"),
    matchedVendorName: text("matched_vendor_name"),
    /** The engine's ParsedResult: identity, amount, period, dueDate, custom. */
    result: jsonb("result"),
    /** ParseError message when a parser recognized the bill but couldn't extract
     * it — the single most useful signal for improving that parser. */
    parseError: text("parse_error"),

    // ── Follow-up ────────────────────────────────────────────────────────────
    /** Optional address the visitor left to hear back about an unrecognized
     * bill. Unverified — anyone can type anyone's address — so it is never
     * linked to an account, never used to authenticate, and receives at most one
     * notice ever (`notified_at`). */
    notifyEmail: text("notify_email"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /** Who the visitor says this bill is from, typed on a submission no parser
     * recognized. The single cheapest way to find out which parser to write
     * next: `raw_text` says what the bill contains, this says what to call it.
     * Free text and unverified — it names a vendor, never a person — so it is a
     * hint for us to read, never matched against `vendors` automatically. */
    vendorGuess: text("vendor_guess"),
    /** "You read this wrong" — the visitor's own account of which field is
     * wrong and what the right value is, reported against a bill a parser DID
     * recognize. Worth more than any metric we could compute: it's a labelled
     * extraction bug on a document we still hold the text of. `report_email` is
     * as inert as `notify_email` above; both are optional. */
    reportMessage: text("report_message"),
    reportEmail: text("report_email"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),

    // ── Claim ────────────────────────────────────────────────────────────────
    claimedByUserId: uuid("claimed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBillId: uuid("claimed_bill_id").references(() => bills.id, {
      onDelete: "set null",
    }),

    // ── Abuse control ────────────────────────────────────────────────────────
    /** HMAC-SHA256(AUTH_SECRET, client IP), hex-truncated. A plain digest of an
     * IP is not anonymization — the whole v4 space is 2^32 values and reverses
     * in seconds — so the keying is what makes this a pseudonym rather than the
     * address itself. Used only to spot floods and enforce the daily cap that
     * the in-process limiter can't (see rateLimit.ts). */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** Which language the drop came from, so a follow-up email matches it. */
    locale: userLocale("locale").notNull().default("es"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The retention sweep's only query. Partial, because the overwhelming
    // majority of rows keep their file and must never enter this index.
    index("bill_submission_sweep_idx")
      .on(t.createdAt)
      .where(
        sql`${t.keepFile} = false and ${t.claimedByUserId} is null and ${t.storageKey} is not null`,
      ),
    // Per-IP daily cap and flood forensics. The in-process token bucket dies
    // with the instance; this index is what makes the sustained limit real.
    index("bill_submission_ip_idx").on(t.ipHash, t.createdAt),
    // "How many people have dropped this exact bill?" — ranks which parser to
    // write next, without scanning raw_text. Deliberately NOT unique: two
    // visitors dropping the same bill are two independent events, and dedup is a
    // claim-time concern `ingestBill` already owns.
    index("bill_submission_text_hash_idx").on(t.textHash),
    index("bill_submission_claimed_idx").on(t.claimedByUserId),
  ],
);

// ── MCP access ──────────────────────────────────────────────────────────────
// Two ways to hold a key to an account from outside the browser, both feeding
// the same bearer check in src/server/mcp/resolve.ts:
//
//   • an OAuth 2.1 grant, minted by an MCP client that walked the consent flow
//     (oauth_client → oauth_code → oauth_grant → oauth_token), and
//   • a personal access token the user minted by hand (api_token), for clients
//     that only know how to send a fixed Authorization header.
//
// EVERY secret in this section is stored as a SHA-256 hex digest, never in the
// clear. Plain SHA-256 rather than bcrypt/argon2 on purpose: these are 256-bit
// values from `randomBytes`, so there is no dictionary to run and no work factor
// worth paying — the slow hashes exist for human-chosen passwords. What matters
// is the same property `bill_submissions.secret_hash` is after: a database dump
// must not be a pile of usable bearer tokens.

/** Access tokens are short-lived and presented on every MCP call; refresh tokens
 * are long-lived and presented only at the token endpoint. Same table because
 * they share a lifecycle — revoking a grant must take both. */
export const oauthTokenKind = pgEnum("oauth_token_kind", ["access", "refresh"]);

/** An MCP client that registered itself at /api/oauth/register (RFC 7591).
 *
 * Registration is open, because that is the point: a client this deployment has
 * never heard of — someone's editor, a CLI, a competing assistant — has to be
 * able to present itself without us provisioning anything by hand. A row here
 * is therefore NOT a statement of trust. It carries no access on its own; only
 * a user walking the consent screen turns one into an `oauth_grant`. Treat every
 * string in it as attacker-controlled display text, `client_name` above all —
 * it is rendered on the consent screen, which is exactly where a lie would pay
 * off. See the note on the consent page. */
export const oauthClients = pgTable("oauth_client", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The public `client_id` handed back at registration and echoed on every
   * /authorize and /token call. Separate from `id` so the value on the wire
   * stays a plain opaque string. */
  clientId: text("client_id").notNull().unique(),
  /** Null for a public client — the common case. An MCP client running on a
   * user's machine cannot keep a secret, which is why OAuth 2.1 leans on PKCE
   * instead; we only store a secret when a confidential client asks for one. */
  clientSecretHash: text("client_secret_hash"),
  name: text("client_name").notNull(),
  /** Exact-match allowlist for the redirect. The single most important field
   * here: matching it loosely (prefix, subdomain, "starts with") is the classic
   * way authorization codes get delivered to somebody else. */
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  clientUri: text("client_uri"),
  logoUri: text("logo_uri"),
  softwareId: text("software_id"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method")
    .notNull()
    .default("none"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** One authorization code, in flight between the consent screen and the token
 * endpoint. Rows live for a minute or two and are deleted the moment they are
 * exchanged — single use is a spec requirement, not an optimization.
 *
 * The code points at the user directly rather than at a grant, so that a code
 * that is never exchanged leaves nothing behind: "connected" means tokens
 * exist, and an abandoned consent must not show up on the account's
 * connected-apps list. */
export const oauthCodes = pgTable(
  "oauth_code",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Frozen from the /authorize call. The token exchange requires the same
     * value back, so a code cannot be redirected somewhere else on redemption. */
    redirectUri: text("redirect_uri").notNull(),
    /** PKCE S256 challenge. `plain` is not accepted anywhere in this flow. */
    codeChallenge: text("code_challenge").notNull(),
    scope: text("scope").notNull(),
    /** RFC 8707 resource indicator — which MCP endpoint the resulting token is
     * for. Recorded for audit; the live check is at both endpoints, which
     * refuse any value that isn't this deployment's own MCP URL. */
    resource: text("resource"),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("oauth_code_expires_idx").on(t.expires)],
);

/** "Claude is connected to my account" — the durable relationship, and the row
 * the connected-apps list draws. Tokens rotate underneath it; this is what the
 * user recognizes and what the revoke button deletes. */
export const oauthGrants = pgTable(
  "oauth_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Refreshed on a throttled heartbeat by the MCP endpoint, same shape as
     * `session.last_active_at` — every call already loads this row, and this
     * bounds how often it also writes one. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Re-consenting must land on the existing grant rather than stacking a
    // second one, or the connected-apps list grows a duplicate row per approval
    // and revoking one leaves the others live.
    uniqueIndex("oauth_grant_client_user_idx").on(t.clientId, t.userId),
    index("oauth_grant_user_idx").on(t.userId),
  ],
);

export const oauthTokens = pgTable(
  "oauth_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    kind: oauthTokenKind("kind").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    /** Set when a refresh token is rotated out, instead of deleting the row.
     * A rotated token presented a second time is the signature of a stolen one —
     * the legitimate client already moved on — so the exchange treats it as
     * theft and revokes the whole grant rather than merely failing. Keeping the
     * spent row is what makes that detectable at all. */
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("oauth_token_grant_idx").on(t.grantId),
    // Drives the expiry sweep. Access tokens turn over hourly, so this table is
    // the one place here that accumulates rows worth deleting on a schedule.
    index("oauth_token_expires_idx").on(t.expires),
  ],
);

/** A token the user minted by hand on the connections page and pasted into a
 * client's config. No OAuth dance, no client identity — just a bearer string
 * bound to an account, for the clients (and scripts) that can only send a fixed
 * header. Shown once, at creation; after that only `hint` remains, which is why
 * the list can name a token without being able to reconstruct it. */
export const apiTokens = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** User-supplied label ("Claude on the laptop"). Display only. */
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** Last few characters of the token, so a user with several can tell which
     * row is the one in their config file. Not a secret and not sufficient to
     * reconstruct anything. */
    hint: text("hint").notNull(),
    /** Null means it never expires — the user's choice at creation. */
    expires: timestamp("expires", { withTimezone: true }),
    /** Null until the token is first presented, so the list can say "never
     * used" rather than implying it was used the moment it was made. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("api_token_user_idx").on(t.userId)],
);

// ── CMS tables ──────────────────────────────────────────────────────────────

/** Who may use the CMS. An explicit allowlist, deliberately separate from
 * `property_members` and from anything on `users`: being a Factura account
 * holder says nothing about being an editor of the public site, and the two
 * must not be able to grant each other by accident.
 *
 * Rows are inserted by hand (locally, and once in production at the rollout
 * gate) — there is no self-service path into this table, which is the point.
 * Deleting a row removes authority immediately, including for any CMS API
 * token the user minted, because every token check re-reads this table.
 *
 * `user_id` is the primary key: one membership per account, so there is no
 * "which row wins" question when resolving a role. */
export const cmsMembers = pgTable("cms_member", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: cmsRole("role").notNull(),
  /** Who granted the membership. Null for the rows inserted by hand to
   * bootstrap an environment, since at that point nobody is a member yet. */
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
