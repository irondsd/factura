import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Neon installs pg_stat_statements into `public`, and its two views are not
  // in schema.ts — so without this, `push` tries to drop them, Postgres
  // refuses, and push aborts halfway (it is not transactional). The filter
  // covers views as well as tables.
  tablesFilter: ["!pg_stat_statements*"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
