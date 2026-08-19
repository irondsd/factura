import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db";
import { cmsApiTokens, cmsMembers } from "@/db/schema";
import type { CmsActor } from "@/cms/types";

export const CMS_SCOPES = ["cms:read", "cms:write"] as const;
export type CmsScope = (typeof CMS_SCOPES)[number];
const PREFIX = "fct_cms_";

export const hashCmsToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export function mintCmsToken(): { token: string; hash: string } {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashCmsToken(token) };
}

export const hasScope = (
  scopes: readonly string[],
  scope: CmsScope,
): boolean => scopes.includes(scope);

export type CmsTokenCaller = CmsActor & {
  tokenId: string;
  scopes: CmsScope[];
};

/** A token remains authoritative only while its holder has an active membership.
 * This query deliberately checks both tables each call; revocation by deleting
 * `cms_member` must bite immediately, without a cache window. */
export async function resolveCmsToken(
  token: string,
  database: Database = defaultDb,
): Promise<CmsTokenCaller | null> {
  if (!token.startsWith(PREFIX)) return null;
  const [row] = await database
    .select({
      tokenId: cmsApiTokens.id,
      userId: cmsApiTokens.userId,
      scopes: cmsApiTokens.scopes,
      expiresAt: cmsApiTokens.expiresAt,
      role: cmsMembers.role,
    })
    .from(cmsApiTokens)
    .innerJoin(cmsMembers, eq(cmsMembers.userId, cmsApiTokens.userId))
    .where(
      and(
        eq(cmsApiTokens.tokenHash, hashCmsToken(token)),
        isNull(cmsApiTokens.revokedAt),
      ),
    );
  if (!row || (row.expiresAt && row.expiresAt <= new Date())) return null;
  const scopes = row.scopes.filter((scope): scope is CmsScope =>
    (CMS_SCOPES as readonly string[]).includes(scope),
  );
  await database
    .update(cmsApiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(cmsApiTokens.id, row.tokenId));
  return { userId: row.userId, email: null, role: row.role, tokenId: row.tokenId, scopes };
}
