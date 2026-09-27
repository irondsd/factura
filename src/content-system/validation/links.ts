import { CONTENT_SECTIONS, type ContentSection } from "../types";
import { parseContentBody } from "./parse";

// Which pages a body links to, read from the parsed tree.
//
// Two ways a body points at another page, and both are links a reader follows:
// a Markdown link — inline `[texto](/guias/x)` or by reference — and a
// component's `href` prop — `<CtaButton href="/demo">`,
// `<PaginaRelacionada href="/estadisticas/x">`. A regex over the source sees
// only the first, which is how a related-page card pointing at nothing used to
// publish without a word. The tree is the same one grammar validation and media
// extraction read (`./parse`), so the three agree about what the document is.
//
// Only paths into a CMS section are returned. `/demo`, `/normativa`, anchors
// and external URLs are other things' business.

export type InternalLink = {
  /** The link as written, without its query or fragment. */
  target: string;
  section: ContentSection;
  /** The full path under the section, `""` for the section index itself. */
  slug: string;
  /** How the body spelled it — a Markdown link or a component's `href`. */
  via: "markdown" | "href";
  line?: number;
  column?: number;
};

type Position = { start: { line: number; column: number } };

type Node = {
  type: string;
  url?: string;
  identifier?: string;
  label?: string;
  children?: Node[];
  attributes?: {
    type: string;
    name?: string;
    value?: unknown;
    position?: Position;
  }[];
  position?: Position;
};

const SECTIONS: ReadonlySet<string> = new Set(CONTENT_SECTIONS);

/** A site path split into the section it lands in and the page under it, or
 * null when it lands anywhere but a CMS section. */
export function parseInternalPath(
  raw: string,
): { target: string; section: ContentSection; slug: string } | null {
  const target = raw.trim().replace(/[?#].*$/, "");
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  const segments = target.split("/").filter((segment) => segment !== "");
  const [section, ...rest] = segments;
  if (!section || !SECTIONS.has(section)) return null;
  return {
    target: target.replace(/\/$/, "") || "/",
    section: section as ContentSection,
    slug: rest.join("/"),
  };
}

export function internalLinksIn(body: string): InternalLink[] {
  let tree: Node;
  try {
    tree = parseContentBody(body) as Node;
  } catch {
    // Grammar validation runs first and stops on a body that does not parse,
    // so no rule that calls this ever sees one.
    return [];
  }

  const definitions = new Map<string, string>();
  walk(tree, (node) => {
    if (node.type === "definition" && node.identifier && node.url) {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
  });

  const links: InternalLink[] = [];
  const add = (
    url: string | undefined,
    via: InternalLink["via"],
    position: Position | undefined,
  ) => {
    const parsed = url ? parseInternalPath(url) : null;
    if (!parsed) return;
    links.push({
      ...parsed,
      via,
      ...(position
        ? { line: position.start.line, column: position.start.column }
        : {}),
    });
  };

  walk(tree, (node) => {
    switch (node.type) {
      case "link":
        add(node.url, "markdown", node.position);
        break;
      case "linkReference":
        add(
          definitions.get((node.identifier ?? node.label ?? "").toLowerCase()),
          "markdown",
          node.position,
        );
        break;
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement":
        for (const attribute of node.attributes ?? []) {
          if (
            attribute.type === "mdxJsxAttribute" &&
            attribute.name === "href" &&
            typeof attribute.value === "string"
          ) {
            add(attribute.value, "href", attribute.position ?? node.position);
          }
        }
        break;
    }
  });
  return links;
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}
