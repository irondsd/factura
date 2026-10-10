import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

// Links in a task description are Markdown source, so a plain click has to
// keep placing the cursor. ⌘-click (Ctrl-click elsewhere) opens them instead —
// the convention of every code editor — and the link is marked so it can be
// found: a dotted rule, a hint on hover, and a hand while the key is held.

const HINT = "⌘/Ctrl + clic para abrir";

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

/** A clickable address, or null. Only the web and mail: a description is
 * shared text, and a `javascript:` link in it must never run. */
export function openableUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  // A bare address the GFM autolinker picked up.
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(url)) return `mailto:${url}`;
  return null;
}

/** The `URL` child of a link-like node, if it has one. */
function urlOf(state: EditorState, node: SyntaxNode): string | null {
  const url = node.name === "URL" ? node : node.getChild("URL");
  return url ? openableUrl(state.sliceDoc(url.from, url.to)) : null;
}

/** The link under `pos`: a bare URL, an `<autolink>`, or anywhere on a
 * `[text](url)` link, its text included. */
export function linkAt(state: EditorState, pos: number): string | null {
  for (const side of [1, -1] as const) {
    for (
      let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
      node;
      node = node.parent
    ) {
      if (["URL", "Link", "Autolink"].includes(node.name)) {
        const url = urlOf(state, node);
        if (url) return url;
      }
    }
  }
  return null;
}

const linkMark = Decoration.mark({
  class: "cm-task-link",
  attributes: { title: HINT },
});

/** The ranges to mark: a link's text and its address, but not the brackets
 * and parentheses around them. */
function linkDecorations(view: EditorView): DecorationSet {
  const ranges: [number, number][] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "Link") {
          const marks = node.node.getChildren("LinkMark");
          // `[`, `]`, `(`, `)` — the text runs between the first two.
          if (marks.length >= 2 && urlOf(view.state, node.node))
            ranges.push([marks[0].to, marks[1].from]);
        } else if (node.name === "URL" && openableUrl(view.state.sliceDoc(node.from, node.to))) {
          ranges.push([node.from, node.to]);
        }
      },
    });
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const builder = new RangeSetBuilder<Decoration>();
  for (const [from, to] of ranges)
    if (to > from) builder.add(from, to, linkMark);
  return builder.finish();
}

const decorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = linkDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = linkDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const modifier = (event: MouseEvent | KeyboardEvent) =>
  event.metaKey || event.ctrlKey;

/** The hand cursor shows only while ⌘/Ctrl is down — without it a click
 * edits, and the cursor should say so. */
function setModifier(view: EditorView, held: boolean) {
  view.dom.classList.toggle("cm-task-link-mod", held);
}

export function taskEditorLinks() {
  return [
    decorations,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || !modifier(event)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const url = pos === null ? null : linkAt(view.state, pos);
        if (!url) return false;
        event.preventDefault();
        window.open(url, "_blank", "noopener,noreferrer");
        return true;
      },
      mousemove(event, view) {
        setModifier(view, modifier(event));
        return false;
      },
      mouseleave(_event, view) {
        setModifier(view, false);
        return false;
      },
      keydown(event, view) {
        setModifier(view, modifier(event));
        return false;
      },
      keyup(event, view) {
        setModifier(view, modifier(event));
        return false;
      },
    }),
    EditorView.theme({
      ".cm-task-link": {
        textDecoration: "underline dotted",
        textUnderlineOffset: "3px",
      },
      "&.cm-task-link-mod .cm-task-link": {
        cursor: "pointer",
        textDecorationStyle: "solid",
      },
    }),
  ];
}
