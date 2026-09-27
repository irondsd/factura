import { parseContentBody } from "../validation/parse";
import {
  parseMediaPermalink,
  type ParsedPermalink,
  scanMediaPermalinks,
} from "./permalink";

// Which media a page refers to, derived from the page itself.
//
// This is the definition the media library's `cms_media_usage` table caches
// (cms.md). It has one safety property that shapes everything below:
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

/** An image pointing at another site. Refused by validation: remote content
 * can change without notice, can carry a tracking pixel, and breaks when the
 * other site reorganizes. */
export type ExternalImageReference = {
  url: string;
  alt: string | null;
  line?: number;
  column?: number;
};

export type ExtractedReferences = {
  media: MediaReference[];
  external: ExternalImageReference[];
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
    // A body the parser cannot read — one saved before a grammar change, say
    // — still points at its images, and the retained version it belongs to
    // still shows them. Reporting nothing would release those images to the
    // purge. So fall back to the text: every permalink-shaped path counts,
    // as a link-kind reference (no alt to check, nothing to render).
    return {
      media: scanMediaPermalinks(body).map(({ id, index }) => ({
        mediaId: id,
        kind: "link" as const,
        alt: null,
        ...lineColumnAt(body, index),
      })),
      external: [],
    };
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
  const external: ExternalImageReference[] = [];

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

  return { media, external };
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

/** 1-based line and column of an offset, like the parser's positions. */
function lineColumnAt(
  text: string,
  index: number,
): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - before.lastIndexOf("\n") };
}

/** Where a media-library id can sit in page metadata. Everything that reads
 * those ids — the usage rows that keep an image from being purged, the
 * library lookup before validation, the validation rules themselves — walks
 * this one list, so a new image field is one entry here rather than three
 * edits of which forgetting any one lets a live page's image be deleted. */
const METADATA_MEDIA_FIELDS = [
  {
    placement: "preview",
    field: "previewMediaId",
    label: "imagen de portada",
    read: (metadata: Record<string, unknown>) => metadata.previewMediaId,
  },
  {
    placement: "logo",
    field: "provider.logoMediaId",
    label: "logo de la ficha",
    read: (metadata: Record<string, unknown>) => {
      const provider = metadata.provider;
      return provider && typeof provider === "object"
        ? (provider as Record<string, unknown>).logoMediaId
        : undefined;
    },
  },
] as const;

export type MetadataMediaReference = {
  /** Lowercased, as PostgreSQL stores it. */
  mediaId: string;
  placement: (typeof METADATA_MEDIA_FIELDS)[number]["placement"];
  /** The metadata path, for a diagnostic's `field` and a usage locator. */
  field: string;
  /** What an editor calls it, for a message. */
  label: string;
};

/** Every media-library id a metadata object holds. */
export function metadataMediaReferences(
  metadata: unknown,
): MetadataMediaReference[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return METADATA_MEDIA_FIELDS.flatMap(({ placement, field, label, read }) => {
    const value = read(metadata as Record<string, unknown>);
    return typeof value === "string" && value
      ? [{ mediaId: value.toLowerCase(), placement, field, label }]
      : [];
  });
}
