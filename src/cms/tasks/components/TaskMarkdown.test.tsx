import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TaskMarkdown from "./TaskMarkdown";

function render(markdown: string) {
  return renderToStaticMarkup(createElement(TaskMarkdown, null, markdown));
}

describe("TaskMarkdown", () => {
  it("renders task-friendly GFM including lists, checkboxes, tables, and links", () => {
    const html = render(
      [
        "## Review notes",
        "",
        "- [x] Checked",
        "- [ ] Still open",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Owner | Ana |",
        "",
        "[Reference](https://example.com/docs)",
      ].join("\n"),
    );

    expect(html).toContain("<h2>Review notes</h2>");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).toContain('disabled=""');
    expect(html).toContain('<div class="');
    expect(html).toContain("<table>");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com/docs"');
  });

  it("filters unsafe link protocols while preserving the link text", () => {
    const html = render(
      "[script](javascript:alert%281%29) and [data](data:text/html,hello)",
    );

    expect(html).toContain("script");
    expect(html).toContain("data");
    expect(html).not.toMatch(/href="(?:javascript|data):/i);
  });

  it("drops raw HTML and script markup from the preview", () => {
    const html = render(
      "<script>globalThis.taskPreviewPwned = true</script>\n\n<div>raw html</div>",
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("taskPreviewPwned");
    expect(html).not.toContain("raw html");
  });

  it("shows image alt text without loading or rendering the image URL", () => {
    const html = render("![invoice scan](https://tracker.example/pixel.png)");

    expect(html).toContain("[imagen: invoice scan]");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("tracker.example");
  });

  it("escapes code examples and gives fenced blocks a scrolling container", () => {
    const html = render(
      [
        "Inline `<script>alert(1)</script>`",
        "",
        "```html",
        "<script>alert(1)</script>",
        "```",
      ].join("\n"),
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<pre class="');
    expect(html).toContain('<code class="language-html">');
  });
});
