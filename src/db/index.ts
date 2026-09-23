import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

// Reuse the connection across Next.js dev hot reloads.
// `prepare: false` is required for the Neon/PgBouncer pooler (`-pooler` host):
// in transaction-pooling mode each transaction gets a different backend, so
// named prepared statements fail intermittently ("prepared statement ... does
// not exist"). `max: 1` because every serverless instance has its own pool —
// keep per-instance connections low so concurrent lambdas don't exhaust Neon.
// `fetch_types: false` skips the `pg_type` lookup postgres.js otherwise runs on
// every new connection — ~8 KB of Neon egress per serverless cold start, only
// to learn array OIDs. Drizzle parses array columns from their text form
// itself (`PgArray.mapFromDriverValue`); a raw `sql` query that selects an
// array gets the `{a,b}` string back.
const client =
  globalForDb.client ??
  postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    fetch_types: false,
  });
globalForDb.client = client;

export const db = drizzle(client, { schema });

/** An in-flight transaction handle, derived from `db.transaction`'s callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The base connection or a transaction. Helpers take this so they compose
 * both standalone and inside a `db.transaction(...)` block. */
export type Database = typeof db | Transaction;
