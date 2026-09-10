import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CMS_USER_QUERY } from "../query";
import { CMS_USER_PAGE_SIZE, CmsUserService } from "./service";
import type { CmsUserStore } from "./store";

describe("CmsUserService", () => {
  it("turns the requested page into a bounded database window", async () => {
    const list = vi.fn().mockResolvedValue({ users: [], matching: 0 });
    const service = new CmsUserService({ list } as unknown as CmsUserStore);

    await service.list({ ...DEFAULT_CMS_USER_QUERY, page: 3 });

    expect(list).toHaveBeenCalledWith(
      { ...DEFAULT_CMS_USER_QUERY, page: 3 },
      {
        limit: CMS_USER_PAGE_SIZE,
        offset: CMS_USER_PAGE_SIZE * 2,
      },
    );
  });
});
