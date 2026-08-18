import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

// Test-only database access for the repository/service integration tests.
//
// Two rules this file exists to enforce:
//
//  1. These tests are skipped, not failed, when there is no database. CI has no
//     Postgres (`.github/workflows/ci.yml`), and `bun run test` must stay green
//     there. Run them locally with `bun run test:db`, which supplies
//     `.env.local`.
//
//  2. They refuse to run against anything that is not a local database. AGENTS
//     and cms.md §2.4 both say production is never a test target; a guard is
//     worth more than a rule, because the failure mode is a test suite that
//     truncates rows in production.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "db"]);

/** The database URL these tests may use, or null when there isn't one. Returns
 * null rather than throwing for "unset"; throws for "set, but not local",
 * because that is a mistake nobody wants silently skipped. */
export function testDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL; refusing to run tests`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run CMS tests against non-local database host "${host}". ` +
        `These tests write and delete rows. Point DATABASE_URL at the local docker compose Postgres.`,
    );
  }
  return url;
}

export const hasTestDatabase = (): boolean => testDatabaseUrl() !== null;

/** A dedicated connection, not the app's singleton: the app's is built at
 * import time from `process.env.DATABASE_URL!` and would throw on import in a
 * process that has none — which is every CI run. */
export function createTestDb() {
  const url = testDatabaseUrl();
  if (!url) throw new Error("no test database");
  const client = postgres(url, { max: 1, prepare: false });
  return { db: drizzle(client, { schema }), client };
}
