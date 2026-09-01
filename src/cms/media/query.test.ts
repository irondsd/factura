import { describe, expect, it } from "vitest";
import {
  MEDIA_NO_COLLECTION_VALUE,
  mediaLibraryFilter,
  mediaLibraryHref,
  mediaLibraryViewFromParam,
} from "./query";

const COLLECTION_ID = "collection-1";
const collections = [{ id: COLLECTION_ID }];

describe("media library URL state", () => {
  it("reads a known collection from the query string", () => {
    expect(mediaLibraryViewFromParam(COLLECTION_ID, collections)).toEqual({
      kind: "collection",
      id: COLLECTION_ID,
    });
  });

  it("uses a sentinel for the uncollected view", () => {
    expect(
      mediaLibraryViewFromParam(MEDIA_NO_COLLECTION_VALUE, collections),
    ).toEqual({ kind: "collection", id: null });
  });

  it("falls back to all media for an unknown or repeated value", () => {
    expect(mediaLibraryViewFromParam("missing", collections)).toEqual({
      kind: "usage",
      usage: "all",
    });
    expect(mediaLibraryViewFromParam([COLLECTION_ID], collections)).toEqual({
      kind: "usage",
      usage: "all",
    });
  });

  it("writes collection views and clears the parameter for other views", () => {
    expect(mediaLibraryHref({ kind: "collection", id: COLLECTION_ID })).toBe(
      `/cms/media?collection=${COLLECTION_ID}`,
    );
    expect(mediaLibraryHref({ kind: "collection", id: null })).toBe(
      `/cms/media?collection=${MEDIA_NO_COLLECTION_VALUE}`,
    );
    expect(mediaLibraryHref({ kind: "usage", usage: "used" })).toBe(
      "/cms/media",
    );
  });

  it("keeps the server and client filters aligned", () => {
    expect(
      mediaLibraryFilter({ kind: "collection", id: COLLECTION_ID }),
    ).toEqual({ collectionId: COLLECTION_ID, search: undefined });
    expect(mediaLibraryFilter({ kind: "collection", id: null })).toEqual({
      collectionId: null,
      search: undefined,
    });
    expect(mediaLibraryFilter({ kind: "trash" }, "chart")).toEqual({
      statuses: ["trashed"],
      search: "chart",
    });
  });
});
