import { evaluate } from "@mdx-js/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/mdx-components";
import { CONTENT_COMPONENTS } from "../components/manifest";
import type { ContentSection, Diagnostic } from "../types";
import { hasErrors } from "../types";
import { GRAMMAR_CODES, validateGrammar } from "../validation/grammar";

// Rendering a body that came out of the database.
//
// The order here is the whole point, and cms.md states it: grammar
// validation first, compilation only if it passes. `evaluate` compiles MDX to a
// function and runs it — so anything that reaches it is executing. The check
// below is what stands between a database row and that.
//
// The plugin list matches `next.config.ts` exactly (`remark-gfm`,
// `rehype-slug`). Guides rely on both: the bill tables are GFM, and every
// heading id the table of contents links to comes from rehype-slug. A second,
// slightly different pipeline would make the CMS preview a lie.

/** Thrown when a body fails grammar validation. Carries the diagnostics so a
 * caller can show them rather than a stack trace. */
export class ContentGrammarError extends Error {
  readonly code = "grammar" as const;
  constructor(readonly diagnostics: Diagnostic[]) {
    super(
      `Content failed grammar validation (${diagnostics.length} problem${diagnostics.length === 1 ? "" : "s"}) and was not compiled.`,
    );
    this.name = "ContentGrammarError";
  }
}

export type CompiledContent = ComponentType<{ components?: MDXComponents }>;

/** Compile a database body into a component.
 *
 * Throws `ContentGrammarError` without compiling when the body contains
 * anything forbidden. There is deliberately no option to skip the check: a
 * "trusted" flag would become the way every caller bypassed it. */
export async function compileContent(
  body: string,
  section: ContentSection,
): Promise<CompiledContent> {
  const grammar = validateGrammar(body, section);
  if (!grammar.ok) throw new ContentGrammarError(grammar.diagnostics);

  return compileValidatedBody(body);
}

export type PreviewCompilation = {
  Content: CompiledContent;
  /** Component names the body writes that the manifest does not have. The
   * caller must supply something for each one, or MDX throws at render. */
  missing: string[];
};

/** Compile a body for the CMS preview, tolerating components that do not exist.
 *
 * An article and the components it uses are often written together, and the
 * components land in the codebase one deploy later than the draft that calls
 * them. Strict compilation makes that draft unviewable in its entirety — one
 * unwritten component and the preview is a single error message where the page
 * should be — which is a bad trade for prose that is otherwise finished.
 *
 * So `mdx.unknown-component` alone stops being fatal *here*, and the names come
 * back for the caller to stub. Nothing else is relaxed: raw HTML, expressions,
 * spreads and every other grammar rule still refuse to compile, which is what
 * keeps this from being the "trusted" flag `compileContent` deliberately has no
 * option for. The public routes and the publish gate still use that one, so an
 * unknown component remains impossible to put in front of a reader. */
export async function compileContentForPreview(
  body: string,
  section: ContentSection,
): Promise<PreviewCompilation> {
  const missing = new Set<string>();
  const blocking = validateGrammar(body, section).diagnostics.filter(
    (diagnostic) => {
      if (diagnostic.code !== GRAMMAR_CODES.unknownComponent) return true;
      if (!diagnostic.component) return true;
      missing.add(diagnostic.component);
      return false;
    },
  );

  if (hasErrors(blocking)) throw new ContentGrammarError(blocking);

  return { Content: await compileValidatedBody(body), missing: [...missing] };
}

/** The compile itself. Private, and taking a body that has already been through
 * the grammar, so there is no path to `evaluate` that skipped it. */
async function compileValidatedBody(body: string): Promise<CompiledContent> {
  const compiled = await evaluate(body, {
    ...jsxRuntime,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug],
    // The body has no imports — grammar validation guarantees it — so there is
    // nothing to resolve relative to. Say so rather than leaving MDX to guess
    // at a base it would only need for a feature this dialect does not have.
    baseUrl: undefined,
    development: false,
  });

  return compiled.default as CompiledContent;
}

/** The components a rendered database page resolves against: the site's
 * markdown element map (headings, tables, links, images — the paper aesthetic
 * guides are written for) plus the manifest's components.
 *
 * `overrides` is how the article route binds the components that need to know
 * which page they are on — `<Faq />` and `<RelatedGuides />` take no props from
 * the author and get their data from the page. Same mechanism the filesystem
 * article route already uses. */
export function contentComponents(
  overrides: MDXComponents = {},
): MDXComponents {
  const manifest = Object.fromEntries(
    Object.entries(CONTENT_COMPONENTS).map(([name, definition]) => [
      name,
      definition.component,
    ]),
  ) as MDXComponents;

  return { ...markdownComponents, ...manifest, ...overrides };
}
