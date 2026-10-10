"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder,
} from "@codemirror/view";
import { styleTags, Tag, tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { markdownTagStyles } from "@/cms/components/markdownHighlight";
import { taskEditorImages, uploadTaskImageFile } from "./taskEditorImages";
import { taskEditorLinks } from "./taskEditorLinks";
import { useTaskImageOrigin } from "./TaskImageOrigin";
import { useTaskToast } from "./TaskToast";

// The task description: Markdown source with the page editor's colours, so a
// heading, a list or a checkbox reads as one while it is being written. No
// preview — a brief is read in the same place it is written, and highlighted
// source is legible enough that a second rendering of it only adds a toggle.
//
// Screenshots can be pasted or dropped in (`taskEditorImages`): they upload,
// land as `![](url)`, and are drawn under that line.
//
// The page editor's furniture (gutters, toolbar, lint, component assistant) is
// left out: a task is a few lines, not an article.

// List markers carry the same tag as every other Markdown mark (`##`, `**`,
// `>`), so they get one of their own here.
const listMark = Tag.define();

// The page editor's colours, with one change: it tints a whole list item, and a
// task is mostly a checklist — a description in solid accent. Here only the
// marker and the task box are tinted; the item's text stays ink.
const highlightStyle = HighlightStyle.define([
  ...markdownTagStyles.filter((style) => style.tag !== tags.list),
  { tag: listMark, color: "var(--accent)" },
  // GFM task boxes, `[ ]` and `[x]`.
  { tag: tags.atom, color: "var(--accent)" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

// The textarea it replaced, kept: hairline border, accent on focus, mono 13px,
// and the ledger ruling — each line sits on a rule, which only holds while
// every line box is exactly one `--ruled-line` tall.
const theme = EditorView.theme({
  "&": {
    border: "1px solid var(--line)",
    color: "var(--ink)",
    fontSize: "13px",
    transition: "border-color 150ms",
  },
  "&.cm-focused": { outline: "none", borderColor: "var(--accent)" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono, monospace)",
    lineHeight: "1.75rem",
    overflow: "auto",
  },
  ".cm-content": {
    minHeight: "var(--task-editor-min-height)",
    padding: "14px 16px",
    boxSizing: "border-box",
    caretColor: "var(--ink)",
    backgroundOrigin: "content-box",
    backgroundImage:
      "repeating-linear-gradient(transparent 0 calc(1.75rem - 1px), rgb(33 29 22 / 0.08) calc(1.75rem - 1px) 1.75rem)",
  },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 26%, var(--card))",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 26%, var(--card))",
  },
});

// ⌘↵ belongs to the dialog around the editor (create the task), not to
// CodeMirror's insert-blank-line.
const keys = defaultKeymap.filter((binding) => binding.key !== "Mod-Enter");

export function TaskDescriptionEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
  labelledBy,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The dialog's shorter, paper-coloured variant. */
  compact?: boolean;
  labelledBy: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // Held in a ref so a new handler doesn't rebuild the editor and drop the
  // cursor; written in an effect, not during render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const origin = useTaskImageOrigin();
  const toast = useTaskToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (!host.current) return;
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({
            base: markdownLanguage,
            extensions: [{ props: [styleTags({ ListMark: listMark })] }],
          }),
          syntaxHighlighting(highlightStyle),
          theme,
          taskEditorLinks(),
          taskEditorImages({
            origin,
            upload: uploadTaskImageFile,
            notify: (message) => toastRef.current(message, "error"),
          }),
          placeholder("Describe qué hay que hacer…"),
          editable.current.of(EditorView.editable.of(!disabled)),
          keymap.of([...keys, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.contentAttributes.of({
            "aria-labelledby": labelledBy,
            role: "textbox",
            "aria-multiline": "true",
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mounted once; `value` and `disabled` are pushed in by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changes from outside the editor — «Deshacer», or the saved text coming
  // back from the server. Typing already matches, so this is a no-op then.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current !== value)
      instance.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  return (
    <div
      ref={host}
      className={cn(
        // Reserves the editor's height before it mounts, so the form below
        // doesn't jump when CodeMirror arrives.
        "min-h-[calc(var(--task-editor-min-height)+2px)] min-w-0",
        compact
          ? "bg-paper [--task-editor-bg:var(--paper)] [--task-editor-min-height:196px]"
          : "bg-card [--task-editor-bg:var(--card)] [--task-editor-min-height:260px] md:[--task-editor-min-height:336px]",
        disabled && "opacity-60",
      )}
    />
  );
}
