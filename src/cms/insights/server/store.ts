import "server-only";
import { desc, eq } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsInsights } from "@/db/schema";
import type { ContentInsight } from "@/content-system/insights/types";

// SQL and nothing else, like every other CMS store. It never joins `cms_page`:
// which page an insight names is checked by the service through the page
// store, so this module stays off the short list of files allowed to read that
// table (`src/cms/boundaries.test.ts`).

type InsightRow = typeof cmsInsights.$inferSelect;

export type InsightValues = Pick<
  InsightRow,
  "pageId" | "title" | "body" | "date" | "onHomepage"
>;

const insightOf = (row: InsightRow): ContentInsight => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export class CmsInsightStore {
  constructor(private readonly database: Database = defaultDb) {}

  /** Newest first — the order the rails show them in. */
  async list(): Promise<ContentInsight[]> {
    const rows = await this.database
      .select()
      .from(cmsInsights)
      .orderBy(desc(cmsInsights.date), desc(cmsInsights.createdAt));
    return rows.map(insightOf);
  }

  async findById(id: string): Promise<ContentInsight | null> {
    const [row] = await this.database
      .select()
      .from(cmsInsights)
      .where(eq(cmsInsights.id, id))
      .limit(1);
    return row ? insightOf(row) : null;
  }

  async insert(input: {
    values: InsightValues;
    actorId: string;
    now: Date;
  }): Promise<ContentInsight> {
    const [row] = await this.database
      .insert(cmsInsights)
      .values({
        ...input.values,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return insightOf(row);
  }

  /** Last write wins: an insight is two sentences, and the lost update a lock
   * would prevent costs retyping them. */
  async update(input: {
    id: string;
    values: InsightValues;
    actorId: string;
    now: Date;
  }): Promise<ContentInsight | null> {
    const [row] = await this.database
      .update(cmsInsights)
      .set({ ...input.values, updatedBy: input.actorId, updatedAt: input.now })
      .where(eq(cmsInsights.id, input.id))
      .returning();
    return row ? insightOf(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.database
      .delete(cmsInsights)
      .where(eq(cmsInsights.id, id))
      .returning({ id: cmsInsights.id });
    return rows.length > 0;
  }
}

export const cmsInsightStore = new CmsInsightStore();
