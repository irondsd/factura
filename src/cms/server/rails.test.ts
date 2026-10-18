import { describe, expect, it, vi } from "vitest";
import { type RailCandidate, railSignatures } from "@/content-system/document";

vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { changedRails, createRailRefresher } = await import("./rails");

// Which related rails a write moves (`./rails`).
//
// The point is the size of the answer. Every article whose rail is refreshed
// is one ISR write, so "all of them, to be safe" is the cost this replaces.
// What must not happen is the opposite: a rail that should have changed and
// was not refreshed is permanent, because nothing else expires it.

const guide = (
  slug: string,
  categories: string[],
  locations: string[] = ["caba"],
  title = `Guía ${slug}`,
): RailCandidate => ({ slug, title, metadata: { categories, locations } });

const section: RailCandidate[] = [
  guide("luz-edesur", ["servicios", "luz"]),
  guide("luz-edenor", ["servicios", "luz"]),
  guide("gas-metrogas", ["servicios", "gas"]),
  guide("agua-aysa", ["servicios", "agua"]),
  guide("abl", ["impuestos"]),
  guide("alquiler-mendoza", ["alquileres"], ["mendoza"]),
  guide("expensas-mendoza", ["expensas"], ["mendoza"]),
];

const diff = (before: RailCandidate[], after: RailCandidate[]) =>
  changedRails(railSignatures(before), railSignatures(after));

describe("which rails a write moves", () => {
  it("moves none when nothing listed changed", () => {
    expect(diff(section, [...section])).toEqual([]);
  });

  it("moves the new page's own rail and only the rails it enters", () => {
    const added = guide("luz-edelap", ["servicios", "luz"]);
    const moved = diff(section, [...section, added]);
    expect(moved).toContain("luz-edelap");
    // A Buenos Aires guide can never enter a Mendoza rail.
    expect(moved).not.toContain("alquiler-mendoza");
    expect(moved).not.toContain("expensas-mendoza");
    expect(moved.length).toBeLessThan(section.length);
  });

  it("moves every rail that listed a page that went down", () => {
    const after = section.filter((page) => page.slug !== "luz-edenor");
    const listedIt = [...railSignatures(section)]
      .filter(([, rail]) => rail.includes('"luz-edenor"'))
      .map(([slug]) => slug);
    expect(listedIt.length).toBeGreaterThan(0);
    expect(diff(section, after)).toEqual(
      expect.arrayContaining([...listedIt, "luz-edenor"]),
    );
  });

  it("moves every rail that shows a page under its old title", () => {
    const after = section.map((page) =>
      page.slug === "gas-metrogas" ? { ...page, title: "Nuevo título" } : page,
    );
    const listedIt = [...railSignatures(section)]
      .filter(([, rail]) => rail.includes('"gas-metrogas"'))
      .map(([slug]) => slug);
    expect(listedIt.length).toBeGreaterThan(0);
    expect(diff(section, after).sort()).toEqual(listedIt.sort());
  });
});

describe("the refresher", () => {
  it("refreshes only what moved", async () => {
    const expired: string[] = [];
    let current = section;
    const rails = createRailRefresher(
      async () => current,
      (_, slug) => expired.push(slug),
    );
    const before = await rails.snapshot("guias");
    current = [...section, guide("luz-edelap", ["servicios", "luz"])];
    await rails.refreshChanged("guias", before);
    expect(expired).toEqual(diff(section, current));
  });

  it("refreshes every rail when the before-state could not be read", async () => {
    const expired: string[] = [];
    const rails = createRailRefresher(
      async () => section,
      (_, slug) => expired.push(slug),
    );
    await rails.refreshChanged("guias", null);
    expect(expired.sort()).toEqual(section.map((page) => page.slug).sort());
  });

  it("does nothing for a section without rails", async () => {
    const read = vi.fn(async () => section);
    const rails = createRailRefresher(read, () => {});
    expect(rails.covers("estadisticas")).toBe(false);
    await rails.refreshChanged("estadisticas", null);
    expect(read).not.toHaveBeenCalled();
  });
});
