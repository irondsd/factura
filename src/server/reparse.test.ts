import { describe, expect, it } from "vitest";
import { reconcileAccount, shouldLearnAlias } from "./reparse";

/** The incident these two functions exist for: one household's Expensas history
 * split across three parsers — a private copy (`vendor.slug` "expensasmitre"),
 * a second copy of it, and finally the official package, whose vendor slug is
 * "dominijanni-expensas" and whose identity is the composite
 * "30-62914040-5:0016" where the old parser read "0016". The moment the winning
 * parser changed, the reparse minted a second vendor and a third account, and
 * the bills page grew a second chip for the same biller. */

describe("shouldLearnAlias", () => {
  it("learns the new parser's slug for the vendor the bill already sits on", () => {
    // The whole point: the NEXT bill from this parser arrives through ingest,
    // where the slug is all there is to match on.
    expect(
      shouldLearnAlias({
        parserVendorSlug: "dominijanni-expensas",
        vendorSlug: "expensasmitre",
        knownSlugs: ["expensasmitre", "edesur"],
      }),
    ).toBe(true);
  });

  it("does nothing when the parser already agrees with the vendor", () => {
    expect(
      shouldLearnAlias({
        parserVendorSlug: "expensasmitre",
        vendorSlug: "expensasmitre",
        knownSlugs: ["expensasmitre"],
      }),
    ).toBe(false);
  });

  it("refuses a slug that is another vendor's canonical name", () => {
    // Binding it would quietly re-route that vendor's future bills here.
    expect(
      shouldLearnAlias({
        parserVendorSlug: "edesur",
        vendorSlug: "expensasmitre",
        knownSlugs: ["expensasmitre", "edesur"],
      }),
    ).toBe(false);
  });

  it("refuses a slug already aliased to some vendor here", () => {
    // knownSlugs carries aliases as well as canonical names, so a slug that
    // resolves anywhere in this property is left alone.
    expect(
      shouldLearnAlias({
        parserVendorSlug: "metrogas-v2",
        vendorSlug: "expensasmitre",
        knownSlugs: ["expensasmitre", "metrogas", "metrogas-v2"],
      }),
    ).toBe(false);
  });
});

describe("reconcileAccount", () => {
  it("prefers the vendor's account carrying the identity just parsed", () => {
    expect(
      reconcileAccount({
        currentAccountId: "old",
        identityAccountId: "match",
        vendorAccountIds: ["old", "match"],
      }),
    ).toBe("match");
  });

  it("keeps the current account when the identity format changed", () => {
    // "0016" became "30-62914040-5:0016", so nothing carries the new number.
    // Staying put is what keeps the bill on the thread its forecasts and its
    // history hang off.
    expect(
      reconcileAccount({
        currentAccountId: "old",
        identityAccountId: null,
        vendorAccountIds: ["old"],
      }),
    ).toBe("old");
  });

  it("drops an account belonging to a different vendor", () => {
    // The quiet half of the bug: the old code rewrote `vendorId` and left
    // `accountId` pointing into the vendor the bill just moved away from, so
    // the two columns described different billers.
    expect(
      reconcileAccount({
        currentAccountId: "someone-elses",
        identityAccountId: null,
        vendorAccountIds: ["a", "b"],
      }),
    ).toBeNull();
  });

  it("returns nothing when the bill has no account at all", () => {
    expect(
      reconcileAccount({
        currentAccountId: null,
        identityAccountId: null,
        vendorAccountIds: ["a"],
      }),
    ).toBeNull();
  });

  it("adopts the identity's account even when the bill had none", () => {
    expect(
      reconcileAccount({
        currentAccountId: null,
        identityAccountId: "match",
        vendorAccountIds: ["match"],
      }),
    ).toBe("match");
  });
});
