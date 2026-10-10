import type { TagStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** Syntax colours for Markdown source, in the site's own palette. Deliberately
 * quiet: these are prose editors, and a rainbow makes an article harder to read
 * than plain text would be. Structure (headings, links, code) is what gets
 * emphasis. Shared by the page editor and the task description. */
export const markdownTagStyles: TagStyle[] = [
  { tag: tags.heading, color: "var(--ink)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600", color: "var(--ink)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--muted)" },
  { tag: tags.monospace, color: "var(--accent)" },
  { tag: tags.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--accent)" },
];
