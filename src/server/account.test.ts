import { describe, expect, it } from "vitest";
import { disposition } from "./account";

// `disposition` is the whole blast radius of an account deletion in one
// function: it decides, per property, whether the property dies with the user,
// survives without them, or needs them to choose. Every destructive step scopes
// itself with the same rule (see doomedPropertyIds), so a wrong answer here is
// the difference between "my account is gone" and "my flatmate's bills are gone".
describe("disposition", () => {
  it("destroys a property the user is alone in", () => {
    expect(disposition({ otherOwners: 0, otherMembers: 0 })).toBe("destroy");
  });

  it("asks when the user is the last owner but others are inside", () => {
    expect(disposition({ otherOwners: 0, otherMembers: 2 })).toBe("choose");
  });

  it("leaves a property that still has another owner", () => {
    expect(disposition({ otherOwners: 1, otherMembers: 3 })).toBe("leave");
  });

  it("leaves a co-owned property even with no other plain members", () => {
    expect(disposition({ otherOwners: 1, otherMembers: 1 })).toBe("leave");
  });

  it("never destroys a property with someone else in it", () => {
    // The property of every case that has company: none may be silently torn
    // down. "choose" still allows deletion, but only as an explicit decision.
    for (const otherMembers of [1, 2, 5]) {
      for (const otherOwners of [0, 1]) {
        expect(disposition({ otherOwners, otherMembers })).not.toBe("destroy");
      }
    }
  });
});
