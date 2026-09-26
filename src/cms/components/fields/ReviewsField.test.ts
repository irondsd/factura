import { describe, expect, it } from "vitest";
import { parseCount, parseScore } from "./ReviewsField";

describe("the ratings inputs", () => {
  it("reads a score written with either decimal mark", () => {
    expect(parseScore("3,4")).toBe(3.4);
    expect(parseScore("3.4")).toBe(3.4);
    expect(parseScore("")).toBeUndefined();
    expect(parseScore("tres")).toBeUndefined();
  });

  it("reads a count with or without thousands separators", () => {
    expect(parseCount("48.210")).toBe(48210);
    expect(parseCount("48 210")).toBe(48210);
    expect(parseCount("48210")).toBe(48210);
    expect(parseCount("4,8 mil")).toBeUndefined();
  });
});
