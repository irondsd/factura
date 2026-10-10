import { describe, expect, it } from "vitest";
import { descriptionPreview } from "./descriptionPreview";

describe("task description preview", () => {
  it("shows readable Markdown text without its formatting or link URLs", () => {
    expect(
      descriptionPreview(
        "## Next step\n\nReview **the draft** and [open the PR](https://example.com/a-very-long-url).\n\n- [ ] Check the result\n- [x] Ship it",
      ),
    ).toBe(
      "Next step\nReview the draft and open the PR.\nCheck the result\nShip it",
    );
  });

  it("keeps code and literal braces, but omits raw HTML", () => {
    expect(
      descriptionPreview(
        "<script>alert('hidden')</script>\n\nUse `{ status: 'todo' }`.",
      ),
    ).toBe("Use { status: 'todo' }.");
  });

  it("bounds long previews without splitting Unicode characters", () => {
    expect(descriptionPreview("🙂".repeat(600))).toBe("🙂".repeat(400) + "…");
    expect(descriptionPreview(" \n\n ")).toBe("");
  });
});
