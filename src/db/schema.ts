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

export const vendorCategory = pgEnum("vendor_category", [
  "electricity",
  "gas",
  "water",
  "expensas",
  "internet",
  "other",
]);

export const billStatus = pgEnum("bill_status", ["parsed", "needs_review"]);

export const memberRole = pgEnum("member_role", ["owner", "member"]);

// ── Auth.js (NextAuth) tables ───────────────────────────────────────────────
// Column *property* names (id, emailVerified, userId, …) must match what the
// @auth/drizzle-adapter reads; the DB column names stay snake_case to match the
// rest of the schema. The adapter omits `id` on insert when it has a default.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
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
  addressVariants: text("address_variants").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
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
    category: vendorCategory("category").notNull(),
    // A color *name* from the vendor palette (see lib/vendorColors). Assigned
    // randomly on creation, user-editable. Hex values live in CSS, not here.
    color: text("color").notNull().default("taupe"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vendor_property_slug_idx").on(t.propertyId, t.slug)],
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
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

/** A parser "package": one owner's mutable working copy (`body` = the engine
 * definition draft) plus its identity. Detection is no longer global — a user
 * only ever runs their OWN packages plus the published versions they've adopted
 * (see `parserAdoptions`), so a careless or hostile package can't affect anyone
 * who hasn't deliberately adopted it. Only the owner may edit. `verified` marks
 * the maintainer-owned official set that every new user auto-adopts. `version`
 * is a monotonic draft revision (bumped on every edit) that drives the owner's
 * own reparse; published snapshots live in `parserVersions`. */
export const parserConfigs = pgTable(
  "parser_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    version: integer("version").notNull().default(1),
    vendorSlug: text("vendor_slug").notNull(),
    displayName: text("display_name").notNull(),
    category: vendorCategory("category").notNull(),
    body: jsonb("body").notNull(),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    publishedAt: timestamp("published_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("parser_version_config_idx").on(t.configId, t.version)],
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
    adoptedAt: timestamp("adopted_at").notNull().defaultNow(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("parser_sample_slug_idx").on(t.userId, t.slug)],
);
