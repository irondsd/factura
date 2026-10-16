import { beforeEach, describe, expect, it, vi } from "vitest";

// Which cache profile each tag is expired with (`./invalidation.ts`).
//
// The split is the whole ISR write budget: the section tag reaches every route
// in the section, and expiring it with `{ expire: 0 }` deletes them all, which
// Vercel bills as a full rewrite of each one even when nothing in it changed.
// Only the pages that actually went up, came down or moved may be deleted.

const calls: [string, unknown][] = [];
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string, profile: unknown) => {
    calls.push([tag, profile]);
  },
}));

const {
  revalidatePublicContent,
  revalidatePublicInsights,
  revalidatePublicLocations,
} = await import("./invalidation");

beforeEach(() => {
  calls.length = 0;
});

describe("a publication", () => {
  it("marks the section stale and expires only the named page", () => {
    revalidatePublicContent("guias", ["una-guia"]);
    expect(calls).toEqual([
      ["content:guias", "max"],
      ["content:guias:doc:una-guia", { expire: 0 }],
    ]);
  });

  it("expires every named page, as a rename's two addresses", () => {
    revalidatePublicContent("guias", ["vieja", "nueva"]);
    expect(calls.filter(([, profile]) => profile !== "max")).toEqual([
      ["content:guias:doc:vieja", { expire: 0 }],
      ["content:guias:doc:nueva", { expire: 0 }],
    ]);
  });
});

describe("a section-wide edit", () => {
  it("deletes nothing when no page is named", () => {
    revalidatePublicContent("guias");
    expect(calls).toEqual([
      ["content:guias", "max"],
      ["content:guias:docs", "max"],
    ]);
  });

  it("deletes nothing for a location or an insight", () => {
    revalidatePublicLocations();
    revalidatePublicInsights();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([, profile]) => profile === "max")).toBe(true);
  });
});
