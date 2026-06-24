import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values (false, null, undefined)", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("supports conditional expressions", () => {
    const active = true;
    const disabled = false;
    expect(
      cn("btn", active && "btn--active", disabled && "btn--disabled"),
    ).toBe("btn btn--active");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});
