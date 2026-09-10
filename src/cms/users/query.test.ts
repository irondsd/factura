import { describe, expect, it } from "vitest";
import {
  cmsUserListHref,
  DEFAULT_CMS_USER_QUERY,
  nextCmsUserSort,
  parseCmsUserQuery,
} from "./query";

describe("parseCmsUserQuery", () => {
  it("defaults to recent activity first", () => {
    expect(parseCmsUserQuery({})).toEqual(DEFAULT_CMS_USER_QUERY);
  });

  it("reads search, sorting and pagination", () => {
    expect(
      parseCmsUserQuery({
        q: "  ada@example.com ",
        orden: "facturas",
        dir: "asc",
        pagina: "3",
      }),
    ).toEqual({
      search: "ada@example.com",
      sort: "facturas",
      direction: "asc",
      page: 3,
    });
  });

  it("drops invalid and unbounded values", () => {
    expect(
      parseCmsUserQuery({
        q: "x".repeat(121),
        orden: "nombre",
        dir: "sideways",
        pagina: "-8",
      }),
    ).toEqual(DEFAULT_CMS_USER_QUERY);
  });
});

describe("CMS user directory URLs", () => {
  it("keeps the default URL clean", () => {
    expect(cmsUserListHref({}, DEFAULT_CMS_USER_QUERY)).toBe("/cms/users");
  });

  it("preserves a search while changing the sort and resetting the page", () => {
    const current = {
      ...DEFAULT_CMS_USER_QUERY,
      search: "ada",
      page: 4,
    };
    expect(cmsUserListHref(nextCmsUserSort(current, "facturas"), current)).toBe(
      "/cms/users?q=ada&orden=facturas",
    );
  });

  it("reverses the active sort", () => {
    expect(
      nextCmsUserSort(
        { ...DEFAULT_CMS_USER_QUERY, direction: "asc" },
        "actividad",
      ),
    ).toEqual({ sort: "actividad", direction: "desc", page: 1 });
  });
});
