import { describe, expect, it } from "vitest";
import {
  CHECKPOINT_WINDOW_MS,
  checkpointIsStale,
  isRevisionKind,
  RETAINED_PUBLICATIONS,
  REVISION_KINDS,
  type VersionEntry,
  versionHint,
  versionLabel,
} from "./revisions";

// The vocabulary of stored versions (cms.md).
//
// `checkpointIsStale` is the one with teeth: it decides whether a save costs a
// durable copy or not, and getting it wrong in either direction is bad in a
// different way. Too eager and ten saves leave ten checkpoints; too lazy and the
// only recoverable state is from days ago.

const entry = (overrides: Partial<VersionEntry> = {}): VersionEntry => ({
  revisionId: "rev-1",
  kind: "published",
  publicationNumber: 3,
  at: "2026-02-01T12:00:00.000Z",
  who: "Editora",
  source: null,
  isLive: false,
  isPublicPreview: false,
  title: "Una guía",
  ...overrides,
});

describe("kinds", () => {
  it("knows exactly four", () => {
    expect([...REVISION_KINDS]).toEqual([
      "wip",
      "checkpoint",
      "preview",
      "published",
    ]);
  });

  it("refuses a kind this build does not know", () => {
    // A row from a newer deploy. The readers degrade rather than throw, and
    // this is the check they degrade on.
    expect(isRevisionKind("wip")).toBe(true);
    expect(isRevisionKind("scheduled")).toBe(false);
  });
});

describe("checkpointIsStale", () => {
  const now = new Date("2026-02-02T12:00:00.000Z");

  it("is true when there is no checkpoint at all", () => {
    // The first save on an existing working copy has to leave something behind
    // — otherwise the state before this editing session is simply gone.
    expect(checkpointIsStale(null, now)).toBe(true);
  });

  it("is false inside the window, so a run of saves costs one copy", () => {
    expect(
      checkpointIsStale(new Date(now.getTime() - 60 * 60 * 1000), now),
    ).toBe(false);
  });

  it("is true once the window has elapsed", () => {
    expect(
      checkpointIsStale(new Date(now.getTime() - CHECKPOINT_WINDOW_MS), now),
    ).toBe(true);
  });

  it("measures instants, not calendar days", () => {
    // 23:58 and 00:02 are four minutes apart and one editing session. A window
    // that reset at midnight would manufacture a checkpoint out of the clock.
    const beforeMidnight = new Date("2026-02-01T23:58:00.000Z");
    const afterMidnight = new Date("2026-02-02T00:02:00.000Z");
    expect(checkpointIsStale(beforeMidnight, afterMidnight)).toBe(false);
  });
});

describe("retention", () => {
  it("keeps three previous publications", () => {
    // Pinned as a number because it is a product decision, not an
    // implementation detail: every retained publication also pins every image
    // it references.
    expect(RETAINED_PUBLICATIONS).toBe(3);
  });
});

describe("labels", () => {
  it("marks the live publication as the one readers see", () => {
    expect(versionLabel(entry({ isLive: true }))).toBe(
      "Publicación 3 · en línea",
    );
    expect(versionLabel(entry())).toBe("Publicación 3");
  });

  it("names the three non-publication kinds without a number", () => {
    expect(versionLabel(entry({ kind: "wip" }))).toBe("Borrador de trabajo");
    expect(versionLabel(entry({ kind: "checkpoint" }))).toBe(
      "Antes de esta sesión",
    );
    expect(versionLabel(entry({ kind: "preview" }))).toBe(
      "Vista previa pública",
    );
  });

  it("explains the kinds whose behaviour is not obvious, and only those", () => {
    // A publication needs no hint: it is a publication. The other three all
    // behave in a way somebody would otherwise have to be told in person.
    expect(versionHint(entry({ kind: "published" }))).toBeNull();
    for (const kind of ["wip", "checkpoint", "preview"] as const) {
      expect(versionHint(entry({ kind }))).toBeTruthy();
    }
  });
});
