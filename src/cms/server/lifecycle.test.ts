import { describe, expect, it } from "vitest";
import {
  isContentEdit,
  levelForSave,
  levelForTransition,
  nextPublishedAt,
  stampsContentUpdatedAt,
} from "./lifecycle";

describe("levelForSave", () => {
  it("lets a draft save with only grammar checks", () => {
    expect(levelForSave("draft")).toBe("draft");
  });

  it("requires document validation to save a preview", () => {
    expect(levelForSave("preview")).toBe("preview");
  });

  it("requires full publish validation to save a published page", () => {
    // The rule that catches people out. Iteration 1 stores one mutable copy, so
    // saving a live page *is* publishing it — there is no previous revision
    // still being served while a broken draft sits behind it.
    expect(levelForSave("published")).toBe("publish");
  });
});

describe("levelForTransition", () => {
  it("gates publishing on the full suite", () => {
    expect(levelForTransition("draft", "published")).toBe("publish");
    expect(levelForTransition("preview", "published")).toBe("publish");
  });

  it("gates a public preview on document validation", () => {
    expect(levelForTransition("draft", "preview")).toBe("preview");
  });

  it("always allows taking a page down", () => {
    // Unpublishing is the recovery action. Gating it on the page validating
    // would mean the pages most in need of being taken down are the ones that
    // cannot be.
    expect(levelForTransition("published", "draft")).toBe("draft");
    expect(levelForTransition("preview", "draft")).toBe("draft");
  });
});

describe("nextPublishedAt", () => {
  const first = new Date("2026-01-01T12:00:00Z");
  const later = new Date("2026-06-01T12:00:00Z");

  it("stamps the first publication", () => {
    expect(nextPublishedAt(null, "published", first)).toEqual(first);
  });

  it("keeps the original date when republishing", () => {
    // An unpublish/republish must not move the visible dateline or the JSON-LD
    // — a page that was briefly down was not rewritten.
    expect(nextPublishedAt(first, "published", later)).toEqual(first);
  });

  it("leaves the date alone when unpublishing", () => {
    expect(nextPublishedAt(first, "draft", later)).toEqual(first);
    expect(nextPublishedAt(first, "preview", later)).toEqual(first);
  });

  it("does not stamp a page that has never been published", () => {
    expect(nextPublishedAt(null, "draft", later)).toBeNull();
  });
});

describe("stampsContentUpdatedAt", () => {
  const first = new Date("2026-01-01T12:00:00Z");

  it("levels the editorial date on a first publication", () => {
    // A page written Monday and published Friday would otherwise have
    // "updated" before "published" — which reads as nonsense and which the
    // document validator rejects, so every later save of that page failed.
    expect(stampsContentUpdatedAt(null, "published")).toBe(true);
  });

  it("leaves it alone when republishing", () => {
    expect(stampsContentUpdatedAt(first, "published")).toBe(false);
  });

  it("leaves it alone when unpublishing", () => {
    expect(stampsContentUpdatedAt(null, "draft")).toBe(false);
    expect(stampsContentUpdatedAt(first, "preview")).toBe(false);
  });
});

describe("isContentEdit", () => {
  it("is true when any content field changed", () => {
    expect(isContentEdit({ body: "hola" })).toBe(true);
    expect(isContentEdit({ title: "Nuevo" })).toBe(true);
  });

  it("is false for a status-only transition", () => {
    // Drives `content_updated_at`, which is the "Actualizado el …" a reader
    // sees. Publishing is not editing.
    expect(isContentEdit({})).toBe(false);
  });
});
