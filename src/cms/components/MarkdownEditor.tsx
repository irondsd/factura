"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  type Diagnostic as CmDiagnostic,
  lintGutter,
  setDiagnostics,
} from "@codemirror/lint";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import type { Diagnostic } from "@/content-system/types";
import { componentAssistantExtension } from "../component-assistant/extension";
import type {
  ComponentCompletionDescriptor,
  ComponentRecipeDescriptor,
} from "../component-assistant/types";

// The Markdown source editor (cms.md): a GitHub-like source workflow, not
// WYSIWYG. Custom components stay visible as source — an editor who writes
// `<TrustBlock />` should see `<TrustBlock />`.
//
// Assembled from CodeMirror's modules rather than the `codemirror` bundle, so
// the editor page ships the six extensions it uses and not the whole kitchen.

/** Syntax colours, in the site's own palette. Deliberately quiet: this is a
 * prose editor, and a rainbow makes an article harder to read than plain text
 * would be. Structure (headings, links, code) is what gets emphasis. */
const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ink)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600", color: "var(--ink)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--muted)" },
  { tag: tags.monospace, color: "var(--accent)" },
  { tag: tags.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--accent)" },
  // JSX in the body: the component tags, which are the one thing here that is
  // not prose and worth being able to pick out at a glance.
  { tag: tags.tagName, color: "var(--accent)" },
  { tag: tags.attributeName, color: "var(--muted)" },
  { tag: tags.attributeValue, color: "var(--ink)" },
]);

const theme = EditorView.theme({
  "&": {
    fontSize: "13.5px",
    backgroundColor: "var(--paper)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
  },
  "&.cm-focused": { outline: "none", borderColor: "var(--accent)" },
  ".cm-content": {
    fontFamily: "var(--font-mono, monospace)",
    padding: "12px 0",
    lineHeight: "1.7",
  },
  ".cm-gutters": {
    backgroundColor: "var(--paper)",
    color: "var(--muted)",
    border: "none",
    borderRight: "1px solid var(--line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--accent-soft)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--accent-soft)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-panels": {
    backgroundColor: "var(--card)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
  },
  ".cm-searchMatch": { backgroundColor: "var(--accent-soft)" },
  ".cm-scroller": { overflow: "auto" },
});

/** Turn a server diagnostic into a CodeMirror lint marker.
 *
 * The server reports 1-based line/column; CodeMirror wants absolute document
 * offsets. A diagnostic with no position (a metadata rule, say) is dropped here
 * rather than pinned to line 1 — the Validation tab lists those, and a marker
 * on an unrelated line is worse than no marker. */
function toCodeMirror(
  state: EditorState,
  diagnostics: readonly Diagnostic[],
): CmDiagnostic[] {
  const markers: CmDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.line === undefined) continue;
    if (diagnostic.line < 1 || diagnostic.line > state.doc.lines) continue;
    const line = state.doc.line(diagnostic.line);
    const from = Math.min(
      line.from + Math.max((diagnostic.column ?? 1) - 1, 0),
      line.to,
    );
    markers.push({
      from,
      // Mark to the end of the line: the parser reports where a problem starts,
      // not how far it runs, and a one-character underline is easy to miss.
      to: line.to,
      severity: diagnostic.severity === "error" ? "error" : "warning",
      message: diagnostic.message,
      source: diagnostic.code,
    });
  }
  return markers;
}

export function MarkdownEditor({
  value,
  onChange,
  diagnostics,
  label,
  componentDescriptors,
  recipes,
}: {
  value: string;
  onChange: (next: string) => void;
  diagnostics: readonly Diagnostic[];
  label: string;
  componentDescriptors: readonly ComponentCompletionDescriptor[];
  recipes: readonly ComponentRecipeDescriptor[];
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Held in a ref so changing the handler does not tear down the editor and
  // lose the cursor. Written in an effect rather than during render: a ref
  // mutated while rendering is a value React may not have committed yet.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current || view.current) return;

    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          lintGutter(),
          history(),
          drawSelection(),
          bracketMatching(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSelectionMatches(),
          search({ top: true }),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlightStyle),
          theme,
          componentAssistantExtension(componentDescriptors, recipes),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.contentAttributes.of({
            "aria-label": label,
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
    // Mounted once. `value` is the initial document; later changes come from
    // typing, and pushing them back in would fight the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Diagnostics arrive after a round trip to the server, so they are pushed in
  // rather than computed by a CodeMirror linter.
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    instance.dispatch(
      setDiagnostics(instance.state, toCodeMirror(instance.state, diagnostics)),
    );
  }, [diagnostics]);

  return <div ref={host} className="cms-editor" />;
}
