// URL state for the read-only CMS user directory. Kept pure so odd or stale
// query strings degrade to a useful list instead of becoming route errors.

export const CMS_USER_SORTS = ["actividad", "registro", "facturas"] as const;

export type CmsUserSort = (typeof CMS_USER_SORTS)[number];
export type CmsUserSortDirection = "asc" | "desc";

export type CmsUserQuery = {
  search?: string;
  sort: CmsUserSort;
  direction: CmsUserSortDirection;
  page: number;
};

export const DEFAULT_CMS_USER_QUERY: CmsUserQuery = {
  sort: "actividad",
  direction: "desc",
  page: 1,
};

type RawParams = {
  q?: string | string[];
  orden?: string | string[];
  dir?: string | string[];
  pagina?: string | string[];
};

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function parseCmsUserQuery(params: RawParams): CmsUserQuery {
  const rawSearch = first(params.q)?.trim();
  const rawSort = first(params.orden);
  const rawPage = Number.parseInt(first(params.pagina) ?? "", 10);

  return {
    search: rawSearch && rawSearch.length <= 120 ? rawSearch : undefined,
    sort: CMS_USER_SORTS.includes(rawSort as CmsUserSort)
      ? (rawSort as CmsUserSort)
      : DEFAULT_CMS_USER_QUERY.sort,
    direction: first(params.dir) === "asc" ? "asc" : "desc",
    page:
      Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 10_000
        ? rawPage
        : 1,
  };
}

/** Build a shareable directory URL. Defaults stay out of the address. */
export function cmsUserListHref(
  patch: Partial<CmsUserQuery>,
  current: CmsUserQuery,
): string {
  const query = { ...current, ...patch };
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.sort !== DEFAULT_CMS_USER_QUERY.sort) {
    params.set("orden", query.sort);
  }
  if (query.direction !== DEFAULT_CMS_USER_QUERY.direction) {
    params.set("dir", query.direction);
  }
  if (query.page > 1) params.set("pagina", String(query.page));
  const suffix = params.toString();
  return suffix ? "/cms/users?" + suffix : "/cms/users";
}

export function nextCmsUserSort(
  current: CmsUserQuery,
  sort: CmsUserSort,
): Pick<CmsUserQuery, "sort" | "direction" | "page"> {
  return {
    sort,
    direction:
      current.sort === sort
        ? current.direction === "desc"
          ? "asc"
          : "desc"
        : "desc",
    page: 1,
  };
}
