import { describe, expect, it } from "vitest";
import { shouldAdoptMatched, storageKeyPlan } from "./claim";

describe("shouldAdoptMatched", () => {
  it("adopts a community parser the visitor watched work", () => {
    // Without this the feature is broken for two of its three tiers: a fresh
    // account auto-adopts official parsers only, so a bill that parsed
    // perfectly on /probar would land in the inbox blank.
    expect(
      shouldAdoptMatched({
        matchedConfigId: "cfg",
        matchedVersionId: "ver",
        matchedTier: "community",
      }),
    ).toBe(true);
  });

  it("adopts a verified parser too", () => {
    expect(
      shouldAdoptMatched({
        matchedConfigId: "cfg",
        matchedVersionId: "ver",
        matchedTier: "verified",
      }),
    ).toBe(true);
  });

  it("does not re-adopt an official parser", () => {
    // adoptOfficialDefaults already ran at sign-up; adopting again would throw
    // on the slug collision for no benefit.
    expect(
      shouldAdoptMatched({
        matchedConfigId: "cfg",
        matchedVersionId: "ver",
        matchedTier: "official",
      }),
    ).toBe(false);
  });

  it("does not adopt when nothing matched", () => {
    expect(
      shouldAdoptMatched({
        matchedConfigId: null,
        matchedVersionId: null,
        matchedTier: null,
      }),
    ).toBe(false);
  });

  it("does not adopt a match missing its frozen version", () => {
    // Adoption pins a published version; without one there is nothing to pin,
    // and adopting the mutable draft would give the user something the visitor
    // never saw.
    expect(
      shouldAdoptMatched({
        matchedConfigId: "cfg",
        matchedVersionId: null,
        matchedTier: "community",
      }),
    ).toBe(false);
  });

  it("does not adopt a version whose config is unknown", () => {
    expect(
      shouldAdoptMatched({
        matchedConfigId: null,
        matchedVersionId: "ver",
        matchedTier: "community",
      }),
    ).toBe(false);
  });
});

describe("storageKeyPlan", () => {
  it("hands the object to the new bill", () => {
    expect(
      storageKeyPlan({ submissionStorageKey: "submissions/a/x.pdf", outcome: "parsed" }),
    ).toBe("transfer");
  });

  it("transfers for every non-duplicate outcome", () => {
    // The bill row exists in all of these; only `duplicate` means someone else
    // already owns a copy.
    for (const outcome of [
      "parsed",
      "unrecognized",
      "parse_failed",
      "unknown_account",
    ] as const) {
      expect(
        storageKeyPlan({ submissionStorageKey: "k", outcome }),
      ).toBe("transfer");
    }
  });

  it("fills in a duplicate bill that has no file of its own", () => {
    // A genuine gain: a bill ingested text-only gets its original PDF back.
    expect(
      storageKeyPlan({
        submissionStorageKey: "k",
        outcome: "duplicate",
        existingBillHasStorageKey: false,
      }),
    ).toBe("fill-existing");
  });

  it("deletes our redundant copy when the duplicate already has a file", () => {
    expect(
      storageKeyPlan({
        submissionStorageKey: "k",
        outcome: "duplicate",
        existingBillHasStorageKey: true,
      }),
    ).toBe("delete-ours");
  });

  it("does nothing when there was never an object", () => {
    // Storage unconfigured, or the retention sweep already removed it.
    expect(
      storageKeyPlan({ submissionStorageKey: null, outcome: "parsed" }),
    ).toBe("none");
    expect(
      storageKeyPlan({
        submissionStorageKey: null,
        outcome: "duplicate",
        existingBillHasStorageKey: false,
      }),
    ).toBe("none");
  });

  it("never leaves two rows pointing at one object", () => {
    // The invariant the whole function exists for: `bills.delete` calls
    // deleteObject, so a shared key would leave the other row dangling. Every
    // outcome must either move the key or dispose of it — never duplicate it.
    const plans = [
      storageKeyPlan({ submissionStorageKey: "k", outcome: "parsed" }),
      storageKeyPlan({
        submissionStorageKey: "k",
        outcome: "duplicate",
        existingBillHasStorageKey: true,
      }),
      storageKeyPlan({
        submissionStorageKey: "k",
        outcome: "duplicate",
        existingBillHasStorageKey: false,
      }),
    ];
    // In every branch the submission gives the key up (claimOne always nulls
    // its storage_key); the plan only decides who, if anyone, receives it.
    expect(plans).toEqual(["transfer", "delete-ours", "fill-existing"]);
  });
});
