import { describe, expect, it } from "vitest";
import { planRename, RENAME_CODES, type RenameCandidate } from "./rename";

const page = (
  id: string,
  slug: string,
  publishedAt: string | null = "2026-01-01T00:00:00.000Z",
): RenameCandidate => ({ id, slug, publishedAt });

const plan = (
  subject: RenameCandidate,
  to: string,
  others: RenameCandidate[] = [],
) => {
  const result = planRename(subject, to, others);
  if (!result.ok)
    throw new Error(result.problems.map((p) => p.code).join(", "));
  return result.plan;
};

const problems = (
  subject: RenameCandidate,
  to: string,
  others: RenameCandidate[] = [],
) => {
  const result = planRename(subject, to, others);
  if (result.ok) throw new Error("expected the plan to be refused");
  return result.problems.map((problem) => problem.code);
};

describe("planning a rename", () => {
  it("moves the page itself", () => {
    expect(plan(page("a", "vieja"), "nueva").moves).toEqual([
      { id: "a", from: "vieja", to: "nueva", redirect: true },
    ]);
  });

  it("carries every descendant with it", () => {
    const result = plan(page("a", "hub"), "centro", [
      page("b", "hub/uno"),
      page("c", "hub/uno/hondo"),
      page("d", "otra"),
      // A page whose slug merely *starts* with the same letters is not a
      // descendant: "hub-viejo" is a sibling, and moving it would be a bug the
      // prefix check exists to avoid.
      page("e", "hub-viejo"),
    ]);
    expect(result.moves).toEqual([
      { id: "a", from: "hub", to: "centro", redirect: true },
      { id: "b", from: "hub/uno", to: "centro/uno", redirect: true },
      {
        id: "c",
        from: "hub/uno/hondo",
        to: "centro/uno/hondo",
        redirect: true,
      },
    ]);
  });

  it("leaves a redirect only for a path that was ever public", () => {
    const result = plan(page("a", "hub"), "centro", [
      page("b", "hub/borrador", null),
    ]);
    expect(result.redirectsToAdd).toEqual(["hub"]);
  });

  it("drops any redirect standing where a page now lives", () => {
    // The page just took this address back. A redirect from it would send a
    // reader away from the page they asked for.
    expect(plan(page("a", "vieja"), "nueva").redirectsToDrop).toEqual([
      "nueva",
    ]);
  });

  it("refuses an address another page holds", () => {
    expect(
      problems(page("a", "vieja"), "ocupada", [page("b", "ocupada")]),
    ).toEqual([RENAME_CODES.taken]);
  });

  it("refuses a destination a descendant would land on", () => {
    expect(
      problems(page("a", "hub"), "centro", [
        page("b", "hub/uno"),
        page("c", "centro/uno"),
      ]),
    ).toEqual([RENAME_CODES.taken]);
  });

  it("refuses a malformed address", () => {
    for (const slug of [
      "",
      "/",
      "Con Mayúsculas",
      "acento-ñ",
      "doble--guion",
    ]) {
      expect(problems(page("a", "vieja"), slug)).toEqual([
        RENAME_CODES.invalid,
      ]);
    }
  });

  it("accepts a multi-segment address", () => {
    expect(plan(page("a", "vieja"), "madre/hija").moves[0].to).toBe(
      "madre/hija",
    );
  });

  it("refuses the address the page already has", () => {
    expect(problems(page("a", "vieja"), "vieja")).toEqual([
      RENAME_CODES.unchanged,
    ]);
  });
});
