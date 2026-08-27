import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

export type ExcludedLiteralReason =
  | "inline-code"
  | "fenced-code"
  | "quoted-value"
  | "comment";

export type SourceCompletionContext =
  | {
      kind: "excluded";
      reason: ExcludedLiteralReason;
      from: number;
      to: number;
    }
  | {
      kind: "neutral";
      from: number;
      to: number;
      query: "";
      openContainers: readonly string[];
    }
  | {
      kind: "component-name";
      from: number;
      to: number;
      query: string;
      tagStart: number;
      openContainers: readonly string[];
    }
  | {
      kind: "closing-name";
      from: number;
      to: number;
      query: string;
      tagStart: number;
      openContainers: readonly string[];
    }
  | {
      kind: "property-name";
      from: number;
      to: number;
      query: string;
      tagStart: number;
      componentName: string;
      usedProperties: readonly string[];
      openContainers: readonly string[];
    }
  | {
      kind: "property-value";
      from: number;
      to: number;
      query: string;
      tagStart: number;
      componentName: string;
      propertyName: string;
      usedProperties: readonly string[];
      quote?: string;
      openContainers: readonly string[];
    };

type ParsedAttribute = {
  name: string;
  from: number;
  to: number;
  value?: string;
  valueFrom?: number;
  valueTo?: number;
  quote?: string;
};

type ParsedTagPrefix = {
  closing: boolean;
  name: string;
  nameFrom: number;
  nameTo: number;
  attributes: ParsedAttribute[];
  currentProperty?: { from: number; to: number; query: string };
  currentValue?: {
    propertyName: string;
    from: number;
    to: number;
    query: string;
    quote?: string;
  };
};

type ActiveTag = {
  start: number;
  quote: string | null;
};

type ScanResult = {
  activeTag: ActiveTag | null;
  openContainers: string[];
  inFence: boolean;
  inInlineCode: boolean;
};

const IDENTIFIER_START = /[A-Za-z]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;
const PROPERTY_CHAR = /[A-Za-z0-9_.:-]/;

/** Detect completion context from an ordinary string. This scanner is kept
 * intentionally focused: it only tracks fences, inline-code delimiters, JSX
 * tag boundaries, quotes, and the open container stack. It does not try to
 * parse Markdown or compete with the server grammar validator. */
export function detectSourceContext(
  source: string,
  position = source.length,
): SourceCompletionContext {
  const pos = Math.max(0, Math.min(position, source.length));
  const scan = scanSource(source, pos);

  if (scan.inFence) {
    return { kind: "excluded", reason: "fenced-code", from: pos, to: pos };
  }
  if (scan.inInlineCode) {
    return { kind: "excluded", reason: "inline-code", from: pos, to: pos };
  }

  if (!scan.activeTag) {
    return {
      kind: "neutral",
      from: pos,
      to: pos,
      query: "",
      openContainers: [...scan.openContainers].reverse(),
    };
  }

  const tag = parseTagPrefix(source, scan.activeTag.start, pos);
  const openContainers = [...scan.openContainers].reverse();
  const usedProperties = usedPropertyNames(source, scan.activeTag.start, tag);

  if (tag.currentValue) {
    return {
      kind: "property-value",
      from: tag.currentValue.from,
      to: tag.currentValue.to,
      query: tag.currentValue.query,
      tagStart: scan.activeTag.start,
      componentName: tag.name,
      propertyName: tag.currentValue.propertyName,
      usedProperties,
      ...(tag.currentValue.quote ? { quote: tag.currentValue.quote } : {}),
      openContainers,
    };
  }

  if (tag.closing) {
    return {
      kind: "closing-name",
      from: tag.nameFrom,
      to: tag.nameTo,
      query: tag.name,
      tagStart: scan.activeTag.start,
      openContainers,
    };
  }

  // Until whitespace or another opening-tag token appears, the cursor is
  // completing the JSX name. This includes the exact `<` position and partial
  // names such as `<Ipc`.
  if (!tag.name || pos <= tag.nameTo) {
    return {
      kind: "component-name",
      from: tag.nameFrom,
      to: tag.nameTo,
      query: tag.name,
      tagStart: scan.activeTag.start,
      openContainers,
    };
  }

  const currentProperty = tag.currentProperty;
  return {
    kind: "property-name",
    from: currentProperty?.from ?? pos,
    to: currentProperty?.to ?? pos,
    query: currentProperty?.query ?? "",
    tagStart: scan.activeTag.start,
    componentName: tag.name,
    usedProperties,
    openContainers,
  };
}

/** Everything the tag already spells out, including the attributes written
 * *after* the cursor. Parsing only as far as the cursor would offer `region`
 * again to someone who put the caret in front of an existing `region="…"`, and
 * accepting it would write the property twice. The half-typed name the cursor
 * is on is excluded, so completing it still works. */
function usedPropertyNames(
  source: string,
  tagStart: number,
  tag: ParsedTagPrefix,
): string[] {
  const editing = tag.currentProperty?.query ?? tag.currentValue?.propertyName;
  return parseTagPrefix(source, tagStart, findTagEnd(source, tagStart))
    .attributes.map((attribute) => attribute.name)
    .filter((name) => name !== editing);
}

/** The end of the tag: its first `>` outside a quoted value, or the end of the
 * document for a tag still being written. Scanned from the tag's `<` so the
 * quote state is right — starting at the cursor could pick a closing quote up
 * as an opening one. */
function findTagEnd(source: string, tagStart: number): number {
  let quote: string | null = null;
  for (let cursor = tagStart; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote && source[cursor - 1] !== "\\") quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor;
    }
  }
  return source.length;
}

/** The CodeMirror-facing variant adds syntax-tree exclusions for parser-owned
 * literal nodes. The source scanner still handles incomplete MDX tags, which
 * the Markdown parser intentionally leaves as plain text. */
export function detectCompletionContext(
  state: EditorState,
  position = state.selection.main.head,
): SourceCompletionContext {
  const source = state.doc.toString();
  const context = detectSourceContext(source, position);
  if (context.kind === "excluded") return context;

  const syntaxReason = literalSyntaxReason(state, position);
  return syntaxReason
    ? { kind: "excluded", reason: syntaxReason, from: position, to: position }
    : context;
}

function literalSyntaxReason(
  state: EditorState,
  position: number,
): ExcludedLiteralReason | null {
  const tree = syntaxTree(state);
  const points = [position, Math.max(0, position - 1)];
  const codeNodes = new Set([
    "FencedCode",
    "CodeText",
    "CodeInfo",
    "InlineCode",
    "CodeMark",
    "CommentBlock",
    "HTMLComment",
  ]);

  for (const point of points) {
    let node: SyntaxNode | null = tree.resolveInner(point, -1);
    while (node) {
      // A cursor immediately after a closing delimiter is not inside the
      // literal. The scanner is authoritative at that boundary.
      if (
        node.from < position &&
        position <= node.to &&
        codeNodes.has(node.name)
      ) {
        if (
          node.name === "FencedCode" ||
          node.name === "CodeText" ||
          node.name === "CodeInfo"
        ) {
          return "fenced-code";
        }
        if (node.name === "CommentBlock" || node.name === "HTMLComment") {
          return "comment";
        }
        return "inline-code";
      }
      node = node.parent;
    }
  }
  return null;
}

function scanSource(source: string, end: number): ScanResult {
  let fence: { character: "`" | "~"; length: number } | null = null;
  let inlineDelimiter: string | null = null;
  let activeTag: ActiveTag | null = null;
  const openContainers: string[] = [];
  let lineStart = true;

  for (let index = 0; index < end; index += 1) {
    const character = source[index];

    if (lineStart && !activeTag && !inlineDelimiter) {
      const marker = fenceMarkerAt(source, index, end);
      if (fence) {
        if (
          marker &&
          marker.character === fence.character &&
          marker.length >= fence.length
        ) {
          fence = null;
          index += marker.offset + marker.length - 1;
        }
        if (character === "\n") lineStart = true;
        else lineStart = false;
        continue;
      }
      if (marker) {
        fence = marker;
        index += marker.offset + marker.length - 1;
        if (character === "\n") lineStart = true;
        else lineStart = false;
        continue;
      }
    }

    if (fence) {
      lineStart = character === "\n";
      continue;
    }

    if (inlineDelimiter) {
      if (character === "`") {
        const run = runLength(source, index, "`", end);
        if ("`".repeat(run) === inlineDelimiter) {
          inlineDelimiter = null;
          index += run - 1;
        }
      }
      lineStart = character === "\n";
      continue;
    }

    if (activeTag) {
      if (activeTag.quote) {
        if (character === activeTag.quote && source[index - 1] !== "\\") {
          activeTag.quote = null;
        }
      } else if (character === '"' || character === "'") {
        activeTag.quote = character;
      } else if (character === ">") {
        applyCompletedTag(source, activeTag.start, index + 1, openContainers);
        activeTag = null;
      } else if (character === "<" && canStartTag(source, index, end)) {
        activeTag = { start: index, quote: null };
      }
      lineStart = character === "\n";
      continue;
    }

    if (character === "`") {
      const run = runLength(source, index, "`", end);
      inlineDelimiter = "`".repeat(run);
      index += run - 1;
      lineStart = false;
      continue;
    }

    if (character === "<" && canStartTag(source, index, end)) {
      activeTag = { start: index, quote: null };
    }
    lineStart = character === "\n";
  }

  return {
    activeTag,
    openContainers,
    inFence: fence !== null,
    inInlineCode: inlineDelimiter !== null,
  };
}

function fenceMarkerAt(
  source: string,
  index: number,
  limit: number,
): { character: "`" | "~"; length: number; offset: number } | null {
  let cursor = index;
  let spaces = 0;
  while (source[cursor] === " " && spaces < 4) {
    cursor += 1;
    spaces += 1;
  }
  if (spaces > 3) return null;
  const character = source[cursor];
  if (character !== "`" && character !== "~") return null;
  const length = runLength(source, cursor, character, limit);
  return length >= 3 ? { character, length, offset: cursor - index } : null;
}

function runLength(
  source: string,
  start: number,
  character: string,
  limit = source.length,
): number {
  let end = start;
  while (end < limit && source[end] === character) end += 1;
  return end - start;
}

function canStartTag(source: string, index: number, end: number): boolean {
  const next = source[index + 1];
  return (
    index + 1 >= end ||
    next === "/" ||
    next === ">" ||
    IDENTIFIER_START.test(next ?? "")
  );
}

function applyCompletedTag(
  source: string,
  start: number,
  end: number,
  openContainers: string[],
): void {
  const parsed = parseTagPrefix(source, start, end);
  if (!parsed.name) return;
  const text = source.slice(start, end).trimEnd();
  const selfClosing = text.endsWith("/>");

  if (parsed.closing) {
    for (let index = openContainers.length - 1; index >= 0; index -= 1) {
      if (openContainers[index] === parsed.name) {
        openContainers.splice(index, 1);
        break;
      }
    }
  } else if (!selfClosing) {
    openContainers.push(parsed.name);
  }
}

function parseTagPrefix(
  source: string,
  start: number,
  end: number,
): ParsedTagPrefix {
  let cursor = start + 1;
  const closing = source[cursor] === "/";
  if (closing) cursor += 1;

  const nameFrom = cursor;
  while (cursor < end && IDENTIFIER_CHAR.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  const nameTo = cursor;
  const name = source.slice(nameFrom, nameTo);
  const attributes: ParsedAttribute[] = [];

  if (closing || !name) {
    return { closing, name, nameFrom, nameTo, attributes };
  }

  while (cursor < end) {
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor >= end || source[cursor] === ">") break;
    if (source[cursor] === "/") {
      cursor += 1;
      continue;
    }

    const propertyFrom = cursor;
    while (cursor < end && PROPERTY_CHAR.test(source[cursor] ?? "")) {
      cursor += 1;
    }
    if (cursor === propertyFrom) {
      cursor += 1;
      continue;
    }
    const propertyName = source.slice(propertyFrom, cursor);
    const propertyTo = cursor;
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;

    if (source[cursor] !== "=") {
      if (cursor >= end) {
        if (propertyTo < end) {
          // Whitespace after a bare attribute means it is complete (the JSX
          // boolean shorthand), so it belongs in the used-property set and
          // the next completion query starts after the whitespace.
          attributes.push({
            name: propertyName,
            from: propertyFrom,
            to: propertyTo,
          });
          break;
        }
        return {
          closing,
          name,
          nameFrom,
          nameTo,
          attributes,
          currentProperty: {
            from: propertyFrom,
            to: propertyTo,
            query: source.slice(propertyFrom, propertyTo),
          },
        };
      }
      attributes.push({
        name: propertyName,
        from: propertyFrom,
        to: propertyTo,
      });
      continue;
    }

    cursor += 1;
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor >= end) {
      return {
        closing,
        name,
        nameFrom,
        nameTo,
        attributes,
        currentValue: {
          propertyName,
          from: cursor,
          to: cursor,
          query: "",
        },
      };
    }

    const quote =
      source[cursor] === '"' || source[cursor] === "'"
        ? source[cursor]
        : undefined;
    if (quote) {
      const valueFrom = cursor + 1;
      const closingQuote = findClosingQuote(source, valueFrom, end, quote);
      if (closingQuote === -1) {
        return {
          closing,
          name,
          nameFrom,
          nameTo,
          attributes,
          currentValue: {
            propertyName,
            from: valueFrom,
            to: end,
            query: source.slice(valueFrom, end),
            quote,
          },
        };
      }
      attributes.push({
        name: propertyName,
        from: propertyFrom,
        to: closingQuote + 1,
        value: source.slice(valueFrom, closingQuote),
        valueFrom,
        valueTo: closingQuote,
        quote,
      });
      cursor = closingQuote + 1;
      continue;
    }

    const valueFrom = cursor;
    while (
      cursor < end &&
      !/\s/.test(source[cursor] ?? "") &&
      source[cursor] !== ">"
    ) {
      cursor += 1;
    }
    if (cursor >= end) {
      return {
        closing,
        name,
        nameFrom,
        nameTo,
        attributes,
        currentValue: {
          propertyName,
          from: valueFrom,
          to: cursor,
          query: source.slice(valueFrom, cursor),
        },
      };
    }
    attributes.push({
      name: propertyName,
      from: propertyFrom,
      to: cursor,
      value: source.slice(valueFrom, cursor),
      valueFrom,
      valueTo: cursor,
    });
  }

  return { closing, name, nameFrom, nameTo, attributes };
}

function findClosingQuote(
  source: string,
  start: number,
  end: number,
  quote: string,
): number {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (source[cursor] === quote && source[cursor - 1] !== "\\") return cursor;
  }
  return -1;
}
