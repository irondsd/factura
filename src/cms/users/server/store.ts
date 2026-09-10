import "server-only";
import { and, asc, count, desc, ilike, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { users } from "@/db/schema";
import type { CmsUserQuery } from "../query";

// These correlated readings deliberately return one row per account. Joining
// sessions, bills and property memberships together would multiply each count
// by the other two collections before GROUP BY had a chance to fold them.
const lastActiveSql = sql<string | null>`(
  select max(s.last_active_at)
  from session s
  where s.user_id = users.id
)`;

const billCountSql = sql<number>`(
  select count(*)::int
  from bills b
  where b.created_by = users.id
)`;

const propertyCountSql = sql<number>`(
  select count(*)::int
  from property_members pm
  where pm.user_id = users.id
)`;

const isTeamSql = sql<boolean>`exists (
  select 1 from cms_member member where member.user_id = users.id
)`;

export type CmsUserSummary = {
  id: string;
  name: string | null;
  email: string;
  locale: "es" | "en";
  createdAt: string;
  lastActiveAt: string | null;
  billCount: number;
  propertyCount: number;
  isTeam: boolean;
};

export type CmsUserMetrics = {
  totalUsers: number;
  newUsers30d: number;
  activeUsers30d: number;
  usersWithBills: number;
  totalBills: number;
};

export type CmsUserPage = {
  users: CmsUserSummary[];
  matching: number;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function timestampIso(value: unknown): string | null {
  if (!value) return null;
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function orderFor(query: CmsUserQuery) {
  const direction = query.direction === "asc" ? "asc" : "desc";
  switch (query.sort) {
    case "registro":
      return [
        direction === "asc" ? asc(users.createdAt) : desc(users.createdAt),
        asc(users.email),
      ];
    case "facturas":
      return [
        direction === "asc"
          ? sql`${billCountSql} asc`
          : sql`${billCountSql} desc`,
        desc(users.createdAt),
        asc(users.email),
      ];
    default:
      // Unknown activity belongs at the bottom in both directions. Otherwise
      // the default descending order would put never-seen accounts first.
      return [
        direction === "asc"
          ? sql`${lastActiveSql} asc nulls last`
          : sql`${lastActiveSql} desc nulls last`,
        desc(users.createdAt),
        asc(users.email),
      ];
  }
}

export class CmsUserStore {
  constructor(private readonly database: Database = defaultDb) {}

  async list(
    query: CmsUserQuery,
    options: { limit: number; offset: number },
  ): Promise<CmsUserPage> {
    const needle = query.search ? `%${escapeLike(query.search)}%` : undefined;
    const where = needle
      ? and(or(ilike(users.name, needle), ilike(users.email, needle)))
      : undefined;

    const [rows, [total]] = await Promise.all([
      this.database
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          locale: users.locale,
          createdAt: users.createdAt,
          lastActiveAt: lastActiveSql,
          billCount: billCountSql,
          propertyCount: propertyCountSql,
          isTeam: isTeamSql,
        })
        .from(users)
        .where(where)
        .orderBy(...orderFor(query))
        .limit(options.limit)
        .offset(options.offset),
      this.database.select({ value: count() }).from(users).where(where),
    ]);

    return {
      matching: Number(total?.value ?? 0),
      users: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastActiveAt: timestampIso(row.lastActiveAt),
        billCount: Number(row.billCount ?? 0),
        propertyCount: Number(row.propertyCount ?? 0),
        isTeam: Boolean(row.isTeam),
      })),
    };
  }

  async metrics(now: Date): Promise<CmsUserMetrics> {
    // Raw SQL fragments do not carry Drizzle's timestamp-column encoder, so
    // bind an ISO string and cast it explicitly rather than handing
    // postgres.js an untyped Date parameter.
    const since = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [row] = await this.database
      .select({
        totalUsers: sql<number>`count(*)::int`,
        newUsers30d: sql<number>`count(*) filter (where users.created_at >= ${since}::timestamptz)::int`,
        activeUsers30d: sql<number>`count(*) filter (where exists (
          select 1 from session s
          where s.user_id = users.id and s.last_active_at >= ${since}::timestamptz
        ))::int`,
        usersWithBills: sql<number>`count(*) filter (where exists (
          select 1 from bills b where b.created_by = users.id
        ))::int`,
        totalBills: sql<number>`(select count(*)::int from bills)`,
      })
      .from(users);

    return {
      totalUsers: Number(row?.totalUsers ?? 0),
      newUsers30d: Number(row?.newUsers30d ?? 0),
      activeUsers30d: Number(row?.activeUsers30d ?? 0),
      usersWithBills: Number(row?.usersWithBills ?? 0),
      totalBills: Number(row?.totalBills ?? 0),
    };
  }
}

export const cmsUserStore = new CmsUserStore();
