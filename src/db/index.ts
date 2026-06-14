import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

// Reuse the connection across Next.js dev hot reloads
const client =
  globalForDb.client ?? postgres(process.env.DATABASE_URL!, { max: 5 });
globalForDb.client = client;

export const db = drizzle(client, { schema });
