import "server-only";
import type { CmsUserQuery } from "../query";
import {
  cmsUserStore,
  type CmsUserMetrics,
  type CmsUserPage,
  type CmsUserStore,
} from "./store";

export const CMS_USER_PAGE_SIZE = 50;
export type CmsUserMetricSnapshot = CmsUserMetrics & { observedAt: number };

/** Read-only boundary for account analytics. It returns only the fields the
 * directory renders: never session tokens, addresses, bill contents or IPs. */
export class CmsUserService {
  constructor(
    private readonly store: CmsUserStore = cmsUserStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(query: CmsUserQuery): Promise<CmsUserPage> {
    return this.store.list(query, {
      limit: CMS_USER_PAGE_SIZE,
      offset: (query.page - 1) * CMS_USER_PAGE_SIZE,
    });
  }

  async metrics(): Promise<CmsUserMetricSnapshot> {
    const now = this.clock();
    return { ...(await this.store.metrics(now)), observedAt: now.getTime() };
  }
}

export const cmsUserService = new CmsUserService();
