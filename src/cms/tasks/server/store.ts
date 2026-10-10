import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsTasks } from "@/db/schema";
import { descriptionPreview } from "../descriptionPreview";
import type {
  CmsTask,
  CmsTaskSummary,
  TaskStatus,
  TaskTag,
  TaskView,
} from "../types";

type TaskRow = typeof cmsTasks.$inferSelect;
type TaskSummaryRow = Pick<
  TaskRow,
  | "id"
  | "number"
  | "title"
  | "tags"
  | "status"
  | "position"
  | "completedAt"
  | "createdAt"
  | "updatedAt"
> & { descriptionPrefix: string };

const iso = (value: Date): string => value.toISOString();

function taskOf(row: TaskRow): CmsTask {
  return {
    id: row.id,
    number: row.number,
    reference: `TASK-${row.number}`,
    title: row.title,
    description: row.description,
    tags: row.tags as TaskTag[],
    status: row.status as TaskStatus,
    position: row.position,
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function summaryOf(row: TaskSummaryRow): CmsTaskSummary {
  return {
    id: row.id,
    number: row.number,
    reference: `TASK-${row.number}`,
    title: row.title,
    descriptionPreview: descriptionPreview(row.descriptionPrefix),
    tags: row.tags as TaskTag[],
    status: row.status as TaskStatus,
    position: row.position,
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export type TaskListOptions = {
  view: TaskView;
  statuses?: TaskStatus[];
  search?: string;
  tags?: TaskTag[];
  limit: number;
  offset: number;
  cutoff: Date;
};

export type EditableTaskFields = Partial<
  Pick<TaskRow, "title" | "description" | "tags">
>;

export type MoveTaskFields = Partial<
  Pick<TaskRow, "status" | "completedAt" | "description">
>;

export class CmsTaskStore {
  constructor(private readonly database: Database = defaultDb) {}

  bind(database: Database): CmsTaskStore {
    return new CmsTaskStore(database);
  }

  transaction<T>(body: (store: CmsTaskStore) => Promise<T>): Promise<T> {
    return (this.database as typeof defaultDb).transaction((tx) =>
      body(this.bind(tx)),
    );
  }

  /** Serialize lane reads and writes across service instances, including the
   * create-at-end path. The lock is transaction-scoped and independent of a
   * particular task row, since the whole shared ordering is the resource. */
  async lockOrdering(): Promise<void> {
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtext('cms_tasks_ordering'))`,
    );
  }

  async list(options: TaskListOptions): Promise<{
    tasks: CmsTaskSummary[];
    total: number;
  }> {
    const filters: SQL[] = [];
    switch (options.view) {
      case "board":
        filters.push(
          and(
            sql`${cmsTasks.status} <> 'dismissed'`,
            or(
              sql`${cmsTasks.status} <> 'done'`,
              gt(cmsTasks.completedAt, options.cutoff),
            ),
          ) as SQL,
        );
        break;
      case "archive":
        filters.push(
          and(
            eq(cmsTasks.status, "done"),
            lte(cmsTasks.completedAt, options.cutoff),
          ) as SQL,
        );
        break;
      case "dismissed":
        filters.push(eq(cmsTasks.status, "dismissed"));
        break;
      case "all":
        break;
    }
    if (options.statuses)
      filters.push(inArray(cmsTasks.status, options.statuses));
    if (options.search) {
      const escaped = options.search.replace(/[\\%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      filters.push(
        or(
          ilike(cmsTasks.title, pattern),
          ilike(cmsTasks.description, pattern),
          sql`concat('TASK-', ${cmsTasks.number}::text) ilike ${pattern}`,
        ) as SQL,
      );
    }
    if (options.tags?.length)
      filters.push(
        or(
          ...options.tags.map(
            (tag) => sql`${cmsTasks.tags} @> array[${tag}]::text[]`,
          ),
        ) as SQL,
      );

    const where = filters.length ? and(...filters) : undefined;
    const rank = sql`case ${cmsTasks.status}
      when 'backlog' then 0 when 'todo' then 1 when 'in_progress' then 2
      when 'done' then 3 when 'dismissed' then 4 else 5 end`;
    const [countRows, taskRows] = await Promise.all([
      this.database.select({ value: count() }).from(cmsTasks).where(where),
      this.database
        .select({
          id: cmsTasks.id,
          number: cmsTasks.number,
          title: cmsTasks.title,
          descriptionPrefix: sql<string>`left(${cmsTasks.description}, 2000)`,
          tags: cmsTasks.tags,
          status: cmsTasks.status,
          position: cmsTasks.position,
          completedAt: cmsTasks.completedAt,
          createdAt: cmsTasks.createdAt,
          updatedAt: cmsTasks.updatedAt,
        })
        .from(cmsTasks)
        .where(where)
        .orderBy(
          asc(rank),
          desc(cmsTasks.completedAt),
          asc(cmsTasks.position),
          asc(cmsTasks.number),
        )
        .limit(options.limit)
        .offset(options.offset),
    ]);
    return {
      tasks: taskRows.map(summaryOf),
      total: countRows[0]?.value ?? 0,
    };
  }

  async findById(id: string): Promise<CmsTask | null> {
    const [row] = await this.database
      .select()
      .from(cmsTasks)
      .where(eq(cmsTasks.id, id))
      .limit(1);
    return row ? taskOf(row) : null;
  }

  async findByNumber(number: number): Promise<CmsTask | null> {
    const [row] = await this.database
      .select()
      .from(cmsTasks)
      .where(eq(cmsTasks.number, number))
      .limit(1);
    return row ? taskOf(row) : null;
  }

  async laneIds(status: TaskStatus): Promise<string[]> {
    const rows = await this.database
      .select({ id: cmsTasks.id })
      .from(cmsTasks)
      .where(eq(cmsTasks.status, status))
      .orderBy(asc(cmsTasks.position), asc(cmsTasks.number));
    return rows.map((row) => row.id);
  }

  /** Make room at the top of the backlog: new tasks go first, since the
   * newest idea is the one somebody is about to triage. Only positions move —
   * the shifted tasks keep their `updated_at`, which a card shows as its age. */
  async shiftBacklogDown(): Promise<void> {
    await this.database
      .update(cmsTasks)
      .set({ position: sql`${cmsTasks.position} + 1` })
      .where(eq(cmsTasks.status, "backlog"));
  }

  /** The number the next insert will receive, read from the identity sequence
   * rather than `max(number) + 1`, which is wrong after a rolled-back insert
   * consumed a value. A guess for display only — a concurrent create can still
   * take it first. */
  async nextNumber(): Promise<number> {
    const rows = await this.database.execute<{ last: string | null }>(
      sql`select pg_sequence_last_value(pg_get_serial_sequence('cms_task', 'task_number'))::text as last`,
    );
    const last = rows[0]?.last;
    return last == null ? 1 : Number(last) + 1;
  }

  async insert(input: {
    title: string;
    description: string;
    tags: TaskTag[];
    position: number;
    now: Date;
  }): Promise<CmsTask> {
    const [row] = await this.database
      .insert(cmsTasks)
      .values({
        title: input.title,
        description: input.description,
        tags: input.tags,
        status: "backlog",
        position: input.position,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    return taskOf(row);
  }

  /** Only supplied content fields are written. Status and position have their
   * own mutation path, so a title edit cannot reset completion or ordering. */
  async updateContent(
    id: string,
    patch: EditableTaskFields,
    now: Date,
  ): Promise<CmsTask | null> {
    const [row] = await this.database
      .update(cmsTasks)
      .set({ ...patch, updatedAt: now })
      .where(eq(cmsTasks.id, id))
      .returning();
    return row ? taskOf(row) : null;
  }

  async moveFields(
    id: string,
    patch: MoveTaskFields,
    now: Date,
  ): Promise<CmsTask | null> {
    const [row] = await this.database
      .update(cmsTasks)
      .set({ ...patch, updatedAt: now })
      .where(eq(cmsTasks.id, id))
      .returning();
    return row ? taskOf(row) : null;
  }

  /** Re-number a lane with only position and updated_at writes. In particular,
   * moving a card never rewrites the descriptions of its neighbours. */
  async setLaneOrder(ids: string[], now: Date): Promise<void> {
    if (!ids.length) return;
    const entries = ids.map(
      (id, position) => sql`(${id}::uuid, ${position}::integer)`,
    );
    const positions = sql.join(entries, sql`, `);
    await this.database.execute(sql`
      update ${cmsTasks} as task
      set position = v.position, updated_at = ${now.toISOString()}::timestamptz
      from (values ${positions}) as v(id, position)
      where task.id = v.id and task.position is distinct from v.position
    `);
  }
}

export const cmsTaskStore = new CmsTaskStore();
