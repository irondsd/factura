import {
  EditorSelection,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type InlineFormat = "bold" | "italic" | "code" | "link";
export type BlockFormat =
  | "paragraph"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "quote"
  | "code-block";
export type ListFormat = "bullet-list" | "numbered-list";

type Wrapper = { open: string; close: string; placeholder: string };

const INLINE_WRAPPERS: Record<Exclude<InlineFormat, "link">, Wrapper> = {
  bold: { open: "**", close: "**", placeholder: "texto" },
  italic: { open: "*", close: "*", placeholder: "texto" },
  code: { open: "`", close: "`", placeholder: "código" },
};

/**
 * CodeMirror commands are kept as transaction builders so the formatting
 * rules are testable without mounting an editor. The toolbar and shortcuts use
 * the same builders, which prevents two slightly different flavours of bold.
 */
export function inlineFormatTransaction(
  state: EditorState,
  format: InlineFormat,
): TransactionSpec {
  if (format === "link") return linkTransaction(state);
  const wrapper = INLINE_WRAPPERS[format];

  return state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);

    if (range.empty) {
      const insert = `${wrapper.open}${wrapper.placeholder}${wrapper.close}`;
      const from = range.from + wrapper.open.length;
      return {
        changes: { from: range.from, insert },
        range: EditorSelection.range(from, from + wrapper.placeholder.length),
      };
    }

    // A selection can be either the formatted text itself or the whole piece,
    // including its delimiters. Supporting both makes the command a real
    // toggle instead of an operation that can only add more punctuation.
    if (
      selected.startsWith(wrapper.open) &&
      selected.endsWith(wrapper.close) &&
      selected.length > wrapper.open.length + wrapper.close.length
    ) {
      const inner = selected.slice(wrapper.open.length, -wrapper.close.length);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }

    const before = state.sliceDoc(
      Math.max(0, range.from - wrapper.open.length),
      range.from,
    );
    const after = state.sliceDoc(
      range.to,
      Math.min(state.doc.length, range.to + wrapper.close.length),
    );
    if (before === wrapper.open && after === wrapper.close) {
      return {
        changes: [
          { from: range.from - wrapper.open.length, to: range.from },
          { from: range.to, to: range.to + wrapper.close.length },
        ],
        range: EditorSelection.range(
          range.from - wrapper.open.length,
          range.to - wrapper.open.length,
        ),
      };
    }

    const insert = `${wrapper.open}${selected}${wrapper.close}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(
        range.from + wrapper.open.length,
        range.from + wrapper.open.length + selected.length,
      ),
    };
  });
}

function linkTransaction(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);
    const label = selected || "texto";
    const destination = "https://";
    const insert = `[${label}](${destination})`;

    // With an existing label the only missing choice is the destination. For
    // an empty selection, choose the label first so normal typing replaces the
    // placeholder rather than appending to it.
    const selectionFrom = selected
      ? range.from + label.length + 3
      : range.from + 1;
    const selectionLength = selected ? destination.length : label.length;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(
        selectionFrom,
        selectionFrom + selectionLength,
      ),
    };
  });
}

type SelectedLine = {
  from: number;
  to: number;
  text: string;
};

type TextChange = { from: number; to?: number; insert?: string };

function selectedLines(state: EditorState): SelectedLine[] {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from);
  // A selection ending exactly at a later line's start does not format that
  // untouched line. This matches editors people already know and avoids the
  // surprising extra bullet at the end of a downward selection.
  const effectiveTo =
    to > from && state.doc.lineAt(to).from === to ? to - 1 : to;
  const last = state.doc.lineAt(effectiveTo);
  const lines: SelectedLine[] = [];
  for (let number = first.number; number <= last.number; number += 1) {
    const line = state.doc.line(number);
    lines.push({ from: line.from, to: line.to, text: line.text });
  }
  return lines;
}

function lineChangesTransaction(
  state: EditorState,
  changes: readonly TextChange[],
): TransactionSpec {
  const changeSet = state.changes(changes);
  return {
    changes: changeSet,
    selection: state.selection.map(changeSet),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

const QUOTE = /^>\s?/;
const BULLET = /^[-+*]\s+/;
const NUMBER = /^\d+[.)]\s+/;
const BLOCK_PREFIX = /^(?:#{1,6}\s+|>\s?)/;
const CLEARABLE_BLOCK_PREFIX = /^(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/;

function stripMarkdownFormatting(markdown: string): string {
  let plain = markdown.replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/, "$1");

  // Prefixes can be nested (`> ## Título`), so peel them until every
  // selected line starts with its readable content.
  let previous = "";
  while (plain !== previous) {
    previous = plain;
    plain = plain.replace(
      /^(\s*)(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm,
      "$1",
    );
  }

  // Images and CMS components are content, not formatting, and deliberately
  // remain untouched. Ordinary links become their readable labels.
  plain = plain.replace(/(?<!!)\[([^\]\n]+)\]\((?:<[^>\n]+>|[^)\n]+)\)/g, "$1");

  // Repeat because emphasis can be nested (`***texto***`).
  previous = "";
  while (plain !== previous) {
    previous = plain;
    plain = plain
      .replace(/(\*\*|__|~~)([^\n]*?)\1/g, "$2")
      .replace(/`([^`\n]*)`/g, "$1")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2");
  }

  return plain;
}

function surroundingInlineRange(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  const wrappers = ["**", "__", "~~", "`", "*", "_"];
  let expandedFrom = from;
  let expandedTo = to;
  let changed = true;

  while (changed) {
    changed = false;
    for (const wrapper of wrappers) {
      const before = state.sliceDoc(
        Math.max(0, expandedFrom - wrapper.length),
        expandedFrom,
      );
      const after = state.sliceDoc(
        expandedTo,
        Math.min(state.doc.length, expandedTo + wrapper.length),
      );
      if (before !== wrapper || after !== wrapper) continue;
      expandedFrom -= wrapper.length;
      expandedTo += wrapper.length;
      changed = true;
      break;
    }
  }

  // Selecting the visible label inside `[label](destination)` should clear
  // the whole link. The `!` check keeps image Markdown intact.
  const beforeLabel = state.sliceDoc(
    Math.max(0, expandedFrom - 2),
    expandedFrom,
  );
  const afterLabel = state.sliceDoc(
    expandedTo,
    state.doc.lineAt(expandedTo).to,
  );
  const destination = afterLabel.match(/^\]\((?:<[^>\n]+>|[^)\n]+)\)/)?.[0];
  if (
    expandedFrom > 0 &&
    state.sliceDoc(expandedFrom - 1, expandedFrom) === "[" &&
    beforeLabel !== "![" &&
    destination
  ) {
    expandedFrom -= 1;
    expandedTo += destination.length;
  }

  return { from: expandedFrom, to: expandedTo };
}

export function clearFormattingTransaction(
  state: EditorState,
): TransactionSpec {
  if (state.selection.main.empty) {
    const fence = fenceAtCursor(state);
    if (fence) {
      return {
        changes: { from: fence.from, to: fence.to, insert: fence.content },
        selection: EditorSelection.cursor(fence.from),
        scrollIntoView: true,
        userEvent: "input.format",
      };
    }

    const line = state.doc.lineAt(state.selection.main.head);
    const prefix = line.text.match(CLEARABLE_BLOCK_PREFIX)?.[0];
    if (!prefix) return { selection: state.selection };
    const changes = state.changes({
      from: line.from,
      to: line.from + prefix.length,
    });
    return {
      changes,
      selection: state.selection.map(changes),
      scrollIntoView: true,
      userEvent: "input.format",
    };
  }

  return state.changeByRange((range) => {
    const expanded = surroundingInlineRange(state, range.from, range.to);
    const plain = stripMarkdownFormatting(
      state.sliceDoc(expanded.from, expanded.to),
    );
    return {
      changes: { from: expanded.from, to: expanded.to, insert: plain },
      range: EditorSelection.range(expanded.from, expanded.from + plain.length),
    };
  });
}

export function blockFormatTransaction(
  state: EditorState,
  format: BlockFormat,
): TransactionSpec {
  if (format === "code-block") return codeBlockTransaction(state);

  if (format === "paragraph") {
    const fence = fenceAtCursor(state);
    if (fence) {
      return {
        changes: { from: fence.from, to: fence.to, insert: fence.content },
        selection: EditorSelection.range(
          fence.from,
          fence.from + fence.content.length,
        ),
        scrollIntoView: true,
        userEvent: "input.format",
      };
    }
  }

  const lines = selectedLines(state);
  if (format === "quote") {
    const content = lines.filter((line) => line.text.trim());
    const remove =
      content.length > 0 && content.every((line) => QUOTE.test(line.text));
    return lineChangesTransaction(
      state,
      content.map((line) => {
        const match = line.text.match(BLOCK_PREFIX);
        if (remove) {
          return { from: line.from, to: line.from + (match?.[0].length ?? 0) };
        }
        return match
          ? { from: line.from, to: line.from + match[0].length, insert: "> " }
          : { from: line.from, insert: "> " };
      }),
    );
  }

  const prefix =
    format === "heading-2"
      ? "## "
      : format === "heading-3"
        ? "### "
        : format === "heading-4"
          ? "#### "
          : "";
  const content = lines.filter((line) => line.text.trim());
  const remove =
    prefix.length > 0 &&
    content.length > 0 &&
    content.every((line) => line.text.startsWith(prefix));

  return lineChangesTransaction(
    state,
    content.flatMap((line): TextChange[] => {
      const match = line.text.match(BLOCK_PREFIX);
      if (format === "paragraph" || remove) {
        return match
          ? [{ from: line.from, to: line.from + match[0].length }]
          : [];
      }
      return [
        match
          ? {
              from: line.from,
              to: line.from + match[0].length,
              insert: prefix,
            }
          : { from: line.from, insert: prefix },
      ];
    }),
  );
}

export function listFormatTransaction(
  state: EditorState,
  format: ListFormat,
): TransactionSpec {
  const content = selectedLines(state).filter((line) => line.text.trim());
  const marker = format === "bullet-list" ? BULLET : NUMBER;
  const remove =
    content.length > 0 && content.every((line) => marker.test(line.text));
  let number = 0;

  return lineChangesTransaction(
    state,
    content.map((line) => {
      number += 1;
      const existing = line.text.match(BULLET) ?? line.text.match(NUMBER);
      if (remove) {
        return { from: line.from, to: line.from + (existing?.[0].length ?? 0) };
      }
      const insert = format === "bullet-list" ? "- " : `${number}. `;
      return existing
        ? { from: line.from, to: line.from + existing[0].length, insert }
        : { from: line.from, insert };
    }),
  );
}

function codeBlockTransaction(state: EditorState): TransactionSpec {
  const aroundCursor = fenceAtCursor(state);
  if (aroundCursor && state.selection.main.empty) {
    return {
      changes: {
        from: aroundCursor.from,
        to: aroundCursor.to,
        insert: aroundCursor.content,
      },
      selection: EditorSelection.range(
        aroundCursor.from,
        aroundCursor.from + aroundCursor.content.length,
      ),
      scrollIntoView: true,
      userEvent: "input.format",
    };
  }

  const lines = selectedLines(state);
  const from = lines[0]?.from ?? state.selection.main.from;
  const to = lines.at(-1)?.to ?? state.selection.main.to;
  const selected = state.sliceDoc(from, to);
  const fenced = selected.match(/^```[^\n]*\n([\s\S]*)\n```$/);
  if (fenced) {
    return {
      changes: { from, to, insert: fenced[1] },
      selection: EditorSelection.range(from, from + fenced[1].length),
      scrollIntoView: true,
      userEvent: "input.format",
    };
  }

  const content = selected || "código";
  const insert = `\`\`\`text\n${content}\n\`\`\``;
  const contentFrom = from + "```text\n".length;
  return {
    changes: { from, to, insert },
    selection: EditorSelection.range(contentFrom, contentFrom + content.length),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

function fenceAtCursor(
  state: EditorState,
): { from: number; to: number; content: string } | null {
  const current = state.doc.lineAt(state.selection.main.head);
  let opening = 0;
  for (let number = 1; number < current.number; number += 1) {
    if (!/^```/.test(state.doc.line(number).text)) continue;
    opening = opening === 0 ? number : 0;
  }
  if (/^```/.test(current.text)) {
    if (opening !== 0) return fencedRange(state, opening, current.number);
    opening = current.number;
  } else if (opening === 0) {
    return null;
  }

  for (
    let number = current.number + 1;
    number <= state.doc.lines;
    number += 1
  ) {
    const closing = state.doc.line(number);
    if (!/^```\s*$/.test(closing.text)) continue;
    return fencedRange(state, opening, number);
  }
  return null;
}

function fencedRange(
  state: EditorState,
  opening: number,
  closing: number,
): { from: number; to: number; content: string } {
  const openLine = state.doc.line(opening);
  const closeLine = state.doc.line(closing);
  const contentFrom = openLine.to + 1;
  const contentTo =
    closeLine.from > contentFrom ? closeLine.from - 1 : closeLine.from;
  return {
    from: openLine.from,
    to: closeLine.to,
    content: state.sliceDoc(contentFrom, contentTo),
  };
}

function paddedBlock(state: EditorState, content: string): TransactionSpec {
  const { from, to } = state.selection.main;
  const before = state.sliceDoc(0, from);
  const after = state.sliceDoc(to);
  const leading =
    before.length === 0 || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const trailing =
    after.length === 0 || after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n";
  const insert = `${leading}${content}${trailing}`;
  return {
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + leading.length + content.length),
    scrollIntoView: true,
    userEvent: "input.insert",
  };
}

export function tableTransaction(state: EditorState): TransactionSpec {
  const table = [
    "| Columna | Columna |",
    "| --- | --- |",
    "| Dato | Dato |",
  ].join("\n");
  const spec = paddedBlock(state, table);
  const from = state.selection.main.from;
  const leading =
    state.sliceDoc(0, from).endsWith("\n\n") || from === 0
      ? 0
      : state.sliceDoc(0, from).endsWith("\n")
        ? 1
        : 2;
  const labelFrom = from + leading + 2;
  return {
    ...spec,
    selection: EditorSelection.range(labelFrom, labelFrom + "Columna".length),
  };
}

export function dividerTransaction(state: EditorState): TransactionSpec {
  return paddedBlock(state, "---");
}

export function footnoteTransaction(state: EditorState): TransactionSpec {
  const source = state.doc.toString();
  let highest = 0;
  for (const match of source.matchAll(/\[\^(\d+)\]/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  const number = highest + 1;
  const marker = `[^${number}]`;
  const prefix =
    source.length === 0 || source.endsWith("\n\n")
      ? ""
      : source.endsWith("\n")
        ? "\n"
        : "\n\n";
  const placeholder = "Fuente o aclaración.";
  const definition = `${prefix}${marker}: ${placeholder}\n`;
  const at = state.selection.main.to;
  const changes = state.changes([
    { from: at, insert: marker },
    { from: state.doc.length, insert: definition },
  ]);
  // The definition is deliberately last, so its editable copy can be located
  // from the final document length even when the reference was also inserted
  // at the original end (two insertions at the same source position).
  const definitionFrom = changes.newLength - placeholder.length - 1;
  return {
    changes,
    selection: EditorSelection.range(
      definitionFrom,
      definitionFrom + placeholder.length,
    ),
    scrollIntoView: true,
    userEvent: "input.insert",
  };
}

export function insertMarkdownTransaction(
  state: EditorState,
  markdown: string,
): TransactionSpec {
  return paddedBlock(state, markdown);
}

export function currentBlockFormat(state: EditorState): BlockFormat {
  const current = state.doc.lineAt(state.selection.main.head);
  const line = current.text;
  if (/^####\s+/.test(line)) return "heading-4";
  if (/^###\s+/.test(line)) return "heading-3";
  if (/^##\s+/.test(line)) return "heading-2";
  if (QUOTE.test(line)) return "quote";
  if (/^```/.test(line) || fenceAtCursor(state)) return "code-block";
  return "paragraph";
}

export function applyTransaction(
  view: EditorView,
  build: (state: EditorState) => TransactionSpec,
): boolean {
  view.dispatch(build(view.state));
  view.focus();
  return true;
}
