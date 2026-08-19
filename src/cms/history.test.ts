import { describe, expect, it } from "vitest";
import {
  actorLabel,
  buildHistory,
  describeEvent,
  type CmsPageEvent,
  type HistoryFallback,
} from "./history";

// What the «Historia» tab claims about a page.
//
// The wording carries real distinctions — unpublishing a live page and walking
// a preview back are the same target state and not the same event — and the
// fallback is the part that could quietly invent history that never happened,
// so both are pinned here rather than left to the component.

const ANA = { id: "a", name: "Ana", email: "ana@example.com" };
const BRUNO = { id: "b", name: null, email: "bruno@example.com" };

const event = (over: Partial<CmsPageEvent> = {}): CmsPageEvent => ({
  id: "e1",
  action: "saved",
  fromStatus: null,
  toStatus: null,
  source: "browser",
  at: "2026-08-02T10:00:00.000Z",
  actor: ANA,
  ...over,
});

const fallback = (over: Partial<HistoryFallback> = {}): HistoryFallback => ({
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  createdBy: ANA,
  updatedBy: ANA,
  ...over,
});

describe("actorLabel", () => {
  it("prefers the name, then the email", () => {
    expect(actorLabel(ANA)).toBe("Ana");
    expect(actorLabel(BRUNO)).toBe("bruno@example.com");
  });

  it("says the account is gone rather than showing an id", () => {
    expect(actorLabel(null)).toBe("Cuenta eliminada");
    expect(actorLabel({ id: "c", name: "  ", email: null })).toBe(
      "Cuenta eliminada",
    );
  });
});

describe("describeEvent", () => {
  it("separates unpublishing from walking a preview back", () => {
    expect(
      describeEvent({
        action: "status",
        fromStatus: "published",
        toStatus: "draft",
      }),
    ).toBe("despublicó la página");
    expect(
      describeEvent({
        action: "status",
        fromStatus: "preview",
        toStatus: "draft",
      }),
    ).toBe("volvió la página a borrador");
  });

  it("names the other two destinations", () => {
    expect(
      describeEvent({
        action: "status",
        fromStatus: "draft",
        toStatus: "published",
      }),
    ).toBe("publicó la página");
    expect(
      describeEvent({
        action: "status",
        fromStatus: "draft",
        toStatus: "preview",
      }),
    ).toBe("puso la página en vista previa");
  });
});

describe("buildHistory", () => {
  it("orders recorded events newest first", () => {
    const entries = buildHistory({
      events: [
        event({ id: "old", at: "2026-08-02T10:00:00.000Z" }),
        event({ id: "new", at: "2026-08-03T10:00:00.000Z" }),
        event({
          id: "created",
          action: "created",
          at: "2026-08-01T10:00:00.000Z",
        }),
      ],
      fallback: fallback(),
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "new",
      "old",
      "created",
    ]);
    expect(entries.every((entry) => !entry.inferred)).toBe(true);
  });

  it("reconstructs the creation of a page that predates the record", () => {
    const entries = buildHistory({
      events: [event({ id: "e1" })],
      fallback: fallback({ createdBy: BRUNO }),
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "e1",
      "inferred-created",
    ]);
    expect(entries[1]).toMatchObject({
      action: "created",
      who: "bruno@example.com",
      at: "2026-08-01T10:00:00.000Z",
      inferred: true,
      source: null,
    });
  });

  it("shows the last edit of a page with no events at all", () => {
    const entries = buildHistory({
      events: [],
      fallback: fallback({
        updatedAt: "2026-08-05T10:00:00.000Z",
        updatedBy: BRUNO,
      }),
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "inferred-updated",
      "inferred-created",
    ]);
    expect(entries[0].who).toBe("bruno@example.com");
  });

  it("does not invent an edit for a page that was never touched again", () => {
    // `updated_at` equal to `created_at` is a page saved once. A second entry
    // there would be a change that never happened.
    const entries = buildHistory({ events: [], fallback: fallback() });
    expect(entries.map((entry) => entry.key)).toEqual(["inferred-created"]);
  });

  it("keeps a recorded creation rather than adding a second one", () => {
    const entries = buildHistory({
      events: [event({ id: "c", action: "created" })],
      fallback: fallback({ updatedAt: "2026-08-09T10:00:00.000Z" }),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].inferred).toBe(false);
  });
});
