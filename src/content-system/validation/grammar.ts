import { createProcessor } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import {
  componentDefinition,
  componentsForSection,
  isContentComponentName,
} from "../components/definitions";
import type { ContentSection, Diagnostic, ValidationResult } from "../types";
import { validationResult } from "../types";

// Layer 1 of cms.md §5: security/grammar validation.
//
// Database content is a *restricted MDX dialect*, not JavaScript. This module
// parses a body into an AST and refuses it if it contains anything that could
// execute — before any compilation happens, and without evaluating a single
// expression. `parse` builds a tree; it never runs the document.
//
// The rule is allowlist, not denylist. Every JSX element must be a component
// registered in the manifest for this section; everything else is rejected by
// name, including raw HTML. No guide contains raw HTML today, so this costs
// nothing and closes `<script>`, `<iframe>`, and every event handler an
// attribute could carry.
//
// Failures are never silently stripped. cms.md §3.5: reject with a line/column
// error that explains what to write instead.

/** Stable diagnostic codes. The message may be reworded; these may not, because
 * the editor maps them to lint markers and the MCP returns them structurally. */
export const GRAMMAR_CODES = {
  parseError: "mdx.parse-error",
  esm: "mdx.esm-forbidden",
  expression: "mdx.expression-forbidden",
  expressionAttribute: "mdx.expression-attribute-forbidden",
  spreadAttribute: "mdx.spread-attribute-forbidden",
  rawHtml: "mdx.raw-html-forbidden",
  unknownComponent: "mdx.unknown-component",
  wrongSection: "mdx.component-not-in-section",
  unexpectedChildren: "mdx.unexpected-children",
  invalidProps: "mdx.invalid-props",
  unclosed: "mdx.unclosed-element",
} as const;

type Point = { line?: number; column?: number };

/** mdast positions are 1-based, which is what CodeMirror's lint gutter wants. A
 * node with no position is one the parser synthesised; reporting no location is
 * better than reporting a wrong one. */
function at(node: {
  position?: { start: { line: number; column: number } };
}): Point {
  const start = node.position?.start;
  return start ? { line: start.line, column: start.column } : {};
}

const error = (
  code: string,
  message: string,
  point: Point = {},
): Diagnostic => ({ code, severity: "error", message, ...point });

// The parse-only processor. `remark-gfm` is here because the tables, strike-
// through and autolinks in existing guides are GFM, and a validator that did
// not understand them would report their syntax as errors. It matches
// `next.config.ts`, which is what `renderContent` also uses — one dialect, not
// two.
const processor = createProcessor({ remarkPlugins: [remarkGfm] });

type Node = {
  type: string;
  name?: string | null;
  value?: string;
  children?: Node[];
  attributes?: Attribute[];
  position?: { start: { line: number; column: number } };
};

type Attribute = {
  type: string;
  name?: string;
  value?: unknown;
  position?: { start: { line: number; column: number } };
};

/** Validate the grammar of one body. Pure: no I/O, no compilation, no
 * evaluation. */
export function validateGrammar(
  body: string,
  section: ContentSection,
): ValidationResult {
  let tree: Node;
  try {
    tree = processor.parse(body) as Node;
  } catch (cause) {
    // An unclosed tag, a stray `<`, malformed JSX. The parser's message names
    // the position; keep it, it is better than anything restated here.
    const message = cause instanceof Error ? cause.message : String(cause);
    const position = (cause as { line?: number; column?: number }) ?? {};
    return validationResult([
      error(GRAMMAR_CODES.parseError, message, {
        line: position.line,
        column: position.column,
      }),
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  const allowed = componentsForSection(section);
  walk(tree, section, allowed, diagnostics);
  return validationResult(diagnostics);
}

function walk(
  node: Node,
  section: ContentSection,
  allowed: string[],
  out: Diagnostic[],
): void {
  switch (node.type) {
    // `import` / `export` statements. The single most important rejection: an
    // import is arbitrary module loading, and an `export const meta` would put
    // metadata back in the body where §3.7 says it must not be.
    case "mdxjsEsm":
      out.push(
        error(
          GRAMMAR_CODES.esm,
          "import and export are not allowed in content. Components are available by name — no import needed; metadata belongs in the page's fields, not in the body.",
          at(node),
        ),
      );
      return;

    // `{anything}` in the body — a JavaScript expression.
    case "mdxFlowExpression":
    case "mdxTextExpression":
      out.push(
        error(
          GRAMMAR_CODES.expression,
          "JavaScript expressions are not allowed in content. Write the literal text instead. (A literal brace can be written as `\\{`.)",
          at(node),
        ),
      );
      return;

    // Raw HTML that reached the tree as text rather than JSX — an HTML comment,
    // or markdown-embedded HTML.
    case "html":
      out.push(
        error(
          GRAMMAR_CODES.rawHtml,
          "Raw HTML is not allowed in content. Use markdown, or one of the registered components.",
          at(node),
        ),
      );
      return;

    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
      checkJsx(node, section, allowed, out);
      break;
  }

  for (const child of node.children ?? []) walk(child, section, allowed, out);
}

function checkJsx(
  node: Node,
  section: ContentSection,
  allowed: string[],
  out: Diagnostic[],
): void {
  const name = node.name;

  // A fragment (`<>…</>`) parses with a null name. Harmless, but it has no
  // place in prose and allowing it would mean one more shape to reason about.
  if (!name) {
    out.push(
      error(
        GRAMMAR_CODES.rawHtml,
        "Fragments (<>…</>) are not allowed in content.",
        at(node),
      ),
    );
    return;
  }

  const definition = componentDefinition(name);

  if (!definition) {
    // Lowercase names are HTML elements to MDX — `<script>`, `<iframe>`,
    // `<div onClick={…}>`. They are rejected by the same rule as an unknown
    // component, which is what makes the allowlist complete.
    const isHtmlTag = /^[a-z]/.test(name);
    out.push(
      error(
        isHtmlTag ? GRAMMAR_CODES.rawHtml : GRAMMAR_CODES.unknownComponent,
        isHtmlTag
          ? `<${name}> is raw HTML, which is not allowed in content. Use markdown, or one of: ${allowed.join(", ")}.`
          : `<${name}> is not a known component. Available in this section: ${allowed.join(", ")}.`,
        at(node),
      ),
    );
    return;
  }

  if (!isContentComponentName(name) || !definition.sections.includes(section)) {
    out.push(
      error(
        GRAMMAR_CODES.wrongSection,
        `<${name}> cannot be used in ${section}. Available here: ${allowed.join(", ")}.`,
        at(node),
      ),
    );
    return;
  }

  // ── attributes ────────────────────────────────────────────────────────────
  const literals: Record<string, unknown> = {};
  let attributesAreClean = true;

  for (const attribute of node.attributes ?? []) {
    // `{...props}` — a spread carries whatever the expression evaluates to,
    // which is exactly what "literal, schema-validated properties" excludes.
    if (attribute.type === "mdxJsxExpressionAttribute") {
      attributesAreClean = false;
      out.push(
        error(
          GRAMMAR_CODES.spreadAttribute,
          `Spread attributes are not allowed. Write each property on <${name}> literally.`,
          at(attribute),
        ),
      );
      continue;
    }

    const attributeName = attribute.name ?? "";
    const value = attribute.value;

    // `prop={…}` — any JS-valued attribute, which is how an event handler
    // (`onClick={() => …}`) or a function would arrive.
    if (value !== null && typeof value === "object") {
      attributesAreClean = false;
      out.push(
        error(
          GRAMMAR_CODES.expressionAttribute,
          `${attributeName} on <${name}> is a JavaScript expression. Properties must be literal values, written as ${attributeName}="…".`,
          at(attribute),
        ),
      );
      continue;
    }

    // A bare attribute (`newTab`) is JSX shorthand for `true`.
    literals[attributeName] =
      value === null || value === undefined ? true : value;
  }

  // Only check the property schema once the attributes are literal — reporting
  // "unknown property" about a spread the author already knows is invalid is
  // noise on top of a real error.
  if (attributesAreClean) {
    const parsed = definition.props.safeParse(coerceBooleans(literals));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        out.push({
          code: GRAMMAR_CODES.invalidProps,
          severity: "error",
          message: `<${name}> ${path ? `${path}: ` : ""}${issue.message}`,
          field: path || undefined,
          ...at(node),
        });
      }
    }
  }

  // ── children ──────────────────────────────────────────────────────────────
  const children = node.children ?? [];
  const hasContent = children.some(
    (child) => child.type !== "text" || (child.value ?? "").trim() !== "",
  );
  if (definition.kind === "leaf" && hasContent) {
    out.push(
      error(
        GRAMMAR_CODES.unexpectedChildren,
        `<${name}> does not take content between its tags — write it as <${name} />.`,
        at(node),
      ),
    );
  }

  for (const child of children) walk(child, section, allowed, out);
}

/** JSX writes every literal attribute as a string, so `newTab="true"` and the
 * shorthand `newTab` both have to reach a `z.boolean()` as a boolean. Only the
 * two exact spellings convert; anything else stays a string and fails the
 * schema, which is the right answer for `newTab="yes"`. */
function coerceBooleans(
  literals: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(literals)) {
    out[key] = value === "true" ? true : value === "false" ? false : value;
  }
  return out;
}
