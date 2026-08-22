import { describe, expect, it } from "vitest";
import {
  cmsPointer,
  pointerFor,
  publicPointer,
  revisionIdFor,
} from "./revisionSelection";

// Which stored copy a reader sees (cms.md §14.6).
//
// The assertion that matters is the negative one, and it is asserted for every
// status rather than for the one that seems risky: a public read never resolves
// the working copy. Not "does not today" — cannot, because `publicPointer` has
// no branch that returns `"wip"`.

const page = {
  publishedRevisionId: "pub",
  previewRevisionId: "prev",
  wipRevisionId: "wip",
};

describe("publicPointer", () => {
  it("follows the published pointer for a published page", () => {
    expect(publicPointer("published")).toBe("published");
  });

  it("follows the promoted snapshot for a page in preview", () => {
    // Not the latest save: refreshing the shareable preview is an explicit
    // action, and a link somebody sent yesterday keeps showing what it showed.
    expect(publicPointer("preview")).toBe("preview");
  });

  it("resolves nothing for a draft", () => {
    expect(publicPointer("draft")).toBeNull();
  });

  it("never resolves the working copy, in any status", () => {
    for (const status of ["draft", "preview", "published"] as const) {
      expect(publicPointer(status)).not.toBe("wip");
    }
  });
});

describe("cmsPointer", () => {
  it("prefers the working copy", () => {
    expect(cmsPointer(page)).toBe("wip");
  });

  it("falls back to the last publication, then the public preview", () => {
    expect(cmsPointer({ ...page, wipRevisionId: null })).toBe("published");
    expect(
      cmsPointer({ ...page, wipRevisionId: null, publishedRevisionId: null }),
    ).toBe("preview");
  });

  it("resolves nothing for a page with no copies at all", () => {
    expect(
      cmsPointer({
        wipRevisionId: null,
        publishedRevisionId: null,
        previewRevisionId: null,
      }),
    ).toBeNull();
  });
});

describe("pointerFor", () => {
  it("gives the public the published copy of a page the CMS would open as a draft", () => {
    // The whole feature in one assertion: the same row, two audiences, two
    // different copies.
    const editing = { ...page, status: "published" as const };
    expect(pointerFor("public", editing)).toBe("published");
    expect(pointerFor("cms", editing)).toBe("wip");
  });
});

describe("revisionIdFor", () => {
  it("maps each pointer to its column", () => {
    expect(revisionIdFor("published", page)).toBe("pub");
    expect(revisionIdFor("preview", page)).toBe("prev");
    expect(revisionIdFor("wip", page)).toBe("wip");
    expect(revisionIdFor(null, page)).toBeNull();
  });
});
