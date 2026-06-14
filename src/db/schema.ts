import {
  boolean,
  date,
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
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  nickname: text("nickname").notNull(),
  addressVariants: text("address_variants").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  category: vendorCategory("category").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vendorAccounts = pgTable(
  "vendor_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
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
  (t) => [uniqueIndex("vendor_account_number_idx").on(t.vendorId, t.accountNumber)],
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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    accountId: uuid("account_id").references(() => vendorAccounts.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    propertyId: uuid("property_id").references(() => properties.id),
    period: date("period"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("ARS"),
    dueDate: date("due_date"),
    extraordinaryAmount: numeric("extraordinary_amount", {
      precision: 12,
      scale: 2,
    }),
    consumptionValue: numeric("consumption_value", { precision: 12, scale: 3 }),
    consumptionUnit: text("consumption_unit"),
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
  (t) => [uniqueIndex("bill_text_hash_idx").on(t.userId, t.textHash)],
);
