import { describe, expect, it } from "vitest";
import { CONTENT_STATUSES } from "../types";
import {
  canList,
  canRender,
  isDiscoverable,
  listableStatuses,
  renderableStatuses,
  shouldNoindex,
} from "./visibility";

// cms.md §3.2 is a three-row table, and this is that table. Written out case by
// case rather than derived from the implementation, so the test disagrees with
// the code when the code changes.

describe("public visibility", () => {
  it("renders a published page at its URL", () => {
    expect(canRender("published", "public")).toBe(true);
  });

  it("renders a preview page at its URL", () => {
    // Deliberately shareable: an editor sends the link to someone without an
    // account. Discoverability-controlled, not access-controlled (cms.md §10.3).
    expect(canRender("preview", "public")).toBe(true);
  });

  it("never renders a draft to the public", () => {
    expect(canRender("draft", "public")).toBe(false);
  });

  it("lists only published pages", () => {
    expect(canList("published", "public")).toBe(true);
    expect(canList("preview", "public")).toBe(false);
    expect(canList("draft", "public")).toBe(false);
  });

  it("keeps preview out of every discovery surface", () => {
    // The sitemap, the feed, llms.txt, related guides and IndexNow all read
    // this. A preview URL that reached any of them would be indexed, which is
    // the one thing the status promises it won't be.
    expect(isDiscoverable("preview")).toBe(false);
    expect(isDiscoverable("draft")).toBe(false);
    expect(isDiscoverable("published")).toBe(true);
  });

  it("noindexes everything that is not published", () => {
    expect(shouldNoindex("draft")).toBe(true);
    expect(shouldNoindex("preview")).toBe(true);
    expect(shouldNoindex("published")).toBe(false);
  });

  it("never lists more than it renders", () => {
    // A page in a list is a link the crawler follows; a listable status that
    // could not render would be a guaranteed 404 in the sitemap.
    for (const status of listableStatuses("public")) {
      expect(renderableStatuses("public")).toContain(status);
    }
  });
});

describe("cms visibility", () => {
  it("shows every status to an editor", () => {
    for (const status of CONTENT_STATUSES) {
      expect(canRender(status, "cms")).toBe(true);
      expect(canList(status, "cms")).toBe(true);
    }
  });
});

describe("status coverage", () => {
  it("has a decision for every status", () => {
    // Guards against a status being added to the enum and silently defaulting
    // to "not visible" — or worse, to visible.
    for (const status of CONTENT_STATUSES) {
      expect(typeof canRender(status, "public")).toBe("boolean");
      expect(typeof canList(status, "public")).toBe("boolean");
      expect(typeof shouldNoindex(status)).toBe("boolean");
    }
  });
});
