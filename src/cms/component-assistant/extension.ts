import {
  autocompletion,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type {
  ComponentCompletionDescriptor,
  ComponentRecipeDescriptor,
} from "./types";
import { componentCompletionSource } from "./completions";

/** CodeMirror wiring for the assistant. Matching, context detection, and
 * insertion construction live in their own modules; this file only connects
 * them to the editor's completion tooltip and keyboard handling. */
export function componentAssistantExtension(
  descriptors: readonly ComponentCompletionDescriptor[],
  recipes: readonly ComponentRecipeDescriptor[],
): Extension {
  const source = componentCompletionSource(descriptors, recipes);

  return [
    autocompletion({
      override: [source],
      defaultKeymap: false,
      aboveCursor: true,
      filterStrict: true,
      tooltipClass: () => "cms-completion-tooltip",
      positionInfo: (_view, _list, _option, _info, space) => ({
        class: "cms-completion-info",
        style: `max-width: ${Math.max(180, Math.min(360, space.right - space.left - 16))}px;`,
      }),
    }),
    Prec.highest(
      keymap.of([
        {
          key: "Mod-Shift-k",
          run: (view) => startCompletion(view),
        },
        ...completionKeymap,
      ]),
    ),
    // A keymap command is normally enough to consume the event, but the DOM
    // handler makes the shortcut's preventDefault guarantee explicit and
    // keeps Cmd/Ctrl handling identical on macOS and other platforms.
    Prec.highest(
      EditorView.domEventHandlers({
        keydown(event, view) {
          if (!isAssistantShortcut(event)) return false;
          event.preventDefault();
          startCompletion(view);
          return true;
        },
      }),
    ),
  ];
}

export function isAssistantShortcut(event: KeyboardEvent): boolean {
  return (
    !event.isComposing &&
    event.shiftKey &&
    !event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k"
  );
}
