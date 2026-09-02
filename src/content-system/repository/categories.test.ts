import { beforeEach, describe, expect, it, vi } from "vitest";

// Every public read in this directory has to go through the *cached* section
// repository, and these helpers are the ones that stopped doing so. They pair a
// cached category list with a page list, and the page list used to be its own
// uncached query against `publicContentRepository` — so the two halves of one
// answer read the database at two different moments, and neither the sitemap
// nor any other caller could expire what it had never tagged (`./sections`,
// `./tags`). The assertions below are about *where the pages come from*, not
// about filtering, because the filtering was never the part that was wrong.

process.env.CI_CONTENT_FIXTURES = "1";

const listPublished = vi.hoisted(() => vi.fn());
const uncachedListPublished = vi.hoisted(() => vi.fn());

vi.mock("./sections", () => ({
  sectionRepository: () => ({ listPublished }),
}));

// The raw repository is what these helpers must no longer reach for. Mocked so
// that a regression is a failed assertion here rather than a query nobody sees.
vi.mock("./public", () => ({
  publicContentRepository: { listPublished: uncachedListPublished },
}));

// `unstable_cache` needs a Next.js incremental cache that a unit test has not
// got. The identity wrapper keeps the module's own structure under test — the
// point is which read is called, and the cache is what the mocked
// `sectionRepository` above stands in for.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import {
  contentByPrimaryCategory,
  contentInCategory,
  nonEmptyContentCategories,
  publishedContent,
} from "./categories";

const page = (categories: string[]) =>
  ({ slug: "una", metadata: { categories } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  uncachedListPublished.mockRejectedValue(
    new Error("read the cached section repository, not the raw one"),
  );
});

describe("published pages behind the category helpers", () => {
  it("reads the cached section repository, never the raw one", async () => {
    listPublished.mockResolvedValue([]);

    await publishedContent("guias");

    expect(listPublished).toHaveBeenCalledTimes(1);
    expect(uncachedListPublished).not.toHaveBeenCalled();
  });

  it("calls a category non-empty from the same list its caller will read", async () => {
    // The sitemap asks for the categories and the guides separately and then
    // joins them. One cached list is what makes the join total: a category can
    // only come back non-empty because a page in *this* array carries its key.
    listPublished.mockResolvedValue([page(["facturas-y-conceptos"])]);

    const categories = await nonEmptyContentCategories("guias");

    expect(categories.map((c) => c.key)).toEqual(["facturas-y-conceptos"]);
    expect(uncachedListPublished).not.toHaveBeenCalled();
  });

  it("calls no category non-empty when the cached list is empty", async () => {
    // The other side of the same coin, and the one that took a build down: a
    // category the fixtures define, with nothing published under it, must not
    // be listed — `src/app/sitemap.ts` would then date a hub from no timestamps.
    listPublished.mockResolvedValue([]);

    expect(await nonEmptyContentCategories("guias")).toEqual([]);
  });

  it("groups and filters from the cached list too", async () => {
    listPublished.mockResolvedValue([page(["facturas-y-conceptos"])]);

    expect(
      await contentInCategory("guias", "facturas-y-conceptos"),
    ).toHaveLength(1);
    expect(await contentByPrimaryCategory("guias")).toHaveLength(1);
    expect(uncachedListPublished).not.toHaveBeenCalled();
  });
});
