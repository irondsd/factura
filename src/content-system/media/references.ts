import { parseContentBody } from "../validation/parse";
import {
  isLegacyImagePath,
  parseMediaPermalink,
  type ParsedPermalink,
} from "./permalink";

// Which media a page refers to, derived from the page itself.
//
// This is the definition the media library's `cms_media_usage` table caches
// (cms.media.md §3). It has one safety property that shapes everything below:
// **a missed reference is the dangerous direction.** An image whose use is not
// found looks unused, is offered for cleanup, and eventually loses its bytes
// while a live page still points at it. A false positive merely keeps a file
// alive slightly too long.
//
// So extraction is deliberately generous. It reads the parsed tree rather than
// running a regular expression over the source — a regex would happily match a
// permalink inside a fenced code block, and, worse, miss nothing only by
// accident — and it counts every construct that can carry a URL:
//
//   ![alt](/media/…)         Markdown image           → alt rules apply
//   ![alt][ref] + [ref]: …   reference-style image    → alt rules apply
//   [text](/media/…)         a link *to* an image     → still a reference
//   <Component src="/media/…">  any JSX string attribute
//
// Raw HTML `<img>` needs no handling: the grammar validator rejects raw HTML
// outright, so it cannot reach a saved body.

export type MediaReferenceKind = "image" | "link" | "attribute";

export type MediaReference = {
  /** The resolved media id, lowercased. */
  mediaId: string;
  kind: MediaReferenceKind;
  /** Alt text as authored. Only meaningful for `image`; `null` elsewhere. */
  alt: string | null;
  line?: number;
  column?: number;
};

/** A `/img/**` path still in a body during the migration window. Reported
 * separately so validation can warn without treating it as media usage. */
export type LegacyImageReference = {
  url: string;
  alt: string | null;
  line?: number;
  column?: number;
};

export type ExtractedReferences = {
  media: MediaReference[];
  legacy: LegacyImageReference[];
  /** An image pointing at another site. Refused by validation: remote content
   * can change without notice, can carry a tracking pixel, and breaks when the
   * other site reorganizes. */
  external: LegacyImageReference[];
};

type Node = {
  type: string;
  url?: string;
  alt?: string | null;
  identifier?: string;
  label?: string;
  value?: unknown;
  name?: string | null;
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

const at = (node: {
  position?: { start: { line: number; column: number } };
}) =>
  node.position?.start
    ? { line: node.position.start.line, column: node.position.start.column }
    : {};

/** Every media and legacy image reference in one body.
 *
 * Never throws: a body that does not parse has no *extractable* references, and
 * the grammar validator is what reports the syntax error. Returning empty here
 * on a parse failure would be the dangerous direction if it could reach a saved
 * page — it cannot, because a body that does not parse cannot be saved. */
export function extractBodyReferences(body: string): ExtractedReferences {
  let tree: Node;
  try {
    tree = parseContentBody(body) as Node;
  } catch {
    return { media: [], legacy: [], external: [] };
  }

  // Reference-style images (`![alt][key]`) resolve against definitions that may
  // appear anywhere in the document, so collect those first.
  const definitions = new Map<string, string>();
  walk(tree, (node) => {
    if (node.type === "definition" && node.identifier && node.url) {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
  });

  const media: MediaReference[] = [];
  const legacy: LegacyImageReference[] = [];
  const external: LegacyImageReference[] = [];

  const record = (
    url: string | undefined,
    kind: MediaReferenceKind,
    alt: string | null,
    node: Node,
  ) => {
    if (!url) return;
    const parsed: ParsedPermalink | null = parseMediaPermalink(url);
    if (parsed) {
      media.push({ mediaId: parsed.id, kind, alt, ...at(node) });
      return;
    }
    if (kind !== "image") return;
    if (isLegacyImagePath(url)) {
      legacy.push({ url: url.trim(), alt, ...at(node) });
      return;
    }
    if (/^https?:\/\//i.test(url.trim())) {
      external.push({ url: url.trim(), alt, ...at(node) });
    }
  };

  walk(tree, (node) => {
    switch (node.type) {
      case "image":
        record(node.url, "image", node.alt ?? "", node);
        break;
      case "imageReference": {
        const key = (node.identifier ?? node.label ?? "").toLowerCase();
        record(definitions.get(key), "image", node.alt ?? "", node);
        break;
      }
      case "link":
        record(node.url, "link", null, node);
        break;
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement":
        for (const attribute of node.attributes ?? []) {
          // Only literal strings. An expression attribute cannot reach a saved
          // body — the grammar validator rejects those — and guessing at one
          // would be inventing a reference.
          if (
            attribute.type === "mdxJsxAttribute" &&
            typeof attribute.value === "string"
          ) {
            record(attribute.value, "attribute", null, {
              type: "attribute",
              position: attribute.position,
            });
          }
        }
        break;
    }
  });

  return { media, legacy, external };
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** The distinct media ids a body references, in first-appearance order. */
export function mediaIdsIn(body: string): string[] {
  const seen = new Set<string>();
  for (const reference of extractBodyReferences(body).media) {
    seen.add(reference.mediaId);
  }
  return [...seen];
}
