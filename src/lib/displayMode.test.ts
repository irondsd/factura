import { describe, expect, it } from "vitest";
import { isDisplayMode, isInstalled } from "./displayMode";

describe("isDisplayMode", () => {
  // The cookie this guards is set by script, so the allowlist is the boundary
  // between user-controlled input and a column the sessions page renders.
  it("accepts the CSS keywords and nothing else", () => {
    expect(isDisplayMode("browser")).toBe(true);
    expect(isDisplayMode("standalone")).toBe(true);
    expect(isDisplayMode("window-controls-overlay")).toBe(true);
    expect(isDisplayMode("Standalone")).toBe(false);
    expect(isDisplayMode("<script>alert(1)</script>")).toBe(false);
    expect(isDisplayMode("")).toBe(false);
  });
});

describe("isInstalled", () => {
  it("is true only for a session last used from an installed app", () => {
    expect(isInstalled("standalone")).toBe(true);
    expect(isInstalled("fullscreen")).toBe(true);
    expect(isInstalled("minimal-ui")).toBe(true);
    expect(isInstalled("browser")).toBe(false);
  });

  it("treats an unreported mode as a browser, not an app", () => {
    // Sessions predating the probe, and any client that never ran it.
    expect(isInstalled(null)).toBe(false);
    expect(isInstalled(undefined)).toBe(false);
  });
});
