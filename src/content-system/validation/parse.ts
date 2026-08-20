import { createProcessor } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";

// The one parser for the database's restricted MDX dialect.
//
// It lives in its own module because more than one thing needs to read a body
// as a tree — grammar validation refuses anything executable, reference
// extraction finds which images a page uses — and they must agree about what
// the document *is*. Two processors configured separately would be two
// dialects, and the disagreement would show up as a page that validates but
// whose images are invisible to the media library.
//
// `remark-gfm` is here because the tables, strikethrough and autolinks in
// existing guides are GFM, and it matches `next.config.ts`, which is what
// `renderContent` uses.
export const contentProcessor = createProcessor({ remarkPlugins: [remarkGfm] });

/** Parse a body into an mdast/mdxast tree. Builds a tree; never evaluates a
 * single expression. Throws on malformed source — callers that report to an
 * editor catch it and turn the position into a diagnostic. */
export function parseContentBody(body: string): unknown {
  return contentProcessor.parse(body);
}
