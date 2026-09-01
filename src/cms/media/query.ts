import type {
  MediaCollection,
  MediaListFilter,
  MediaUsageFilter,
} from "./types";

export const MEDIA_COLLECTION_PARAM = "collection";
export const MEDIA_NO_COLLECTION_VALUE = "none";

export type MediaLibraryView =
  | { kind: "collection"; id: string | null }
  | { kind: "usage"; usage: MediaUsageFilter }
  | { kind: "trash" };

/**
 * The media library only persists collection selection in the URL. An unknown
 * or repeated value falls back to the default view so a hand-edited URL never
 * leaves the sidebar without an active item.
 */
export function mediaLibraryViewFromParam(
  value: string | string[] | undefined,
  collections: readonly Pick<MediaCollection, "id">[],
): MediaLibraryView {
  if (Array.isArray(value)) return { kind: "usage", usage: "all" };
  if (value === MEDIA_NO_COLLECTION_VALUE) {
    return { kind: "collection", id: null };
  }
  if (value && collections.some((collection) => collection.id === value)) {
    return { kind: "collection", id: value };
  }
  return { kind: "usage", usage: "all" };
}

/** Build the canonical address for one media-library view. */
export function mediaLibraryHref(
  view: MediaLibraryView,
  basePath = "/cms/media",
): string {
  const params = new URLSearchParams();
  if (view.kind === "collection") {
    params.set(MEDIA_COLLECTION_PARAM, view.id ?? MEDIA_NO_COLLECTION_VALUE);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Keep the server's first read and the client refresh on the same filter. */
export function mediaLibraryFilter(
  view: MediaLibraryView,
  search = "",
): MediaListFilter {
  const base: MediaListFilter = { search: search || undefined };
  if (view.kind === "trash") return { ...base, statuses: ["trashed"] };
  if (view.kind === "usage") return { ...base, usage: view.usage };
  return { ...base, collectionId: view.id };
}
