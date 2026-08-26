import {
  autocompletion,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type {
  ComponentCompletionDescriptor,
  ComponentRecipeDescriptor,
} from "./types";
import {
  COMPONENT_ASSISTANT_SHORTCUT,
  componentCompletionSource,
} from "./completions";

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
      // Deliberately not `filterStrict`: that matcher is prefix-only, and the
      // data catalogue is sixty `DatasetSuffix` names. Fuzzy matching still
      // ranks a prefix hit first, and it is what makes `mapa` or `escrhip`
      // find `AlquilerCabaMapa` and `EscriturasHipotecas`.
      tooltipClass: () => "cms-completion-tooltip",
      positionInfo: (_view, _list, _option, _info, space) => ({
        class: "cms-completion-info",
        style: `max-width: ${Math.max(180, Math.min(360, space.right - space.left - 16))}px;`,
      }),
    }),
    // A keymap binding only fires while CodeMirror has focus, and CodeMirror
    // calls `preventDefault` for us as soon as the command returns true — so
    // this one binding is the whole shortcut. `Mod-` is Cmd on macOS and Ctrl
    // everywhere else, which is the decision the plan settled on.
    Prec.highest(
      keymap.of([
        { key: COMPONENT_ASSISTANT_SHORTCUT, run: startCompletion },
        ...completionKeymap,
      ]),
    ),
  ];
}
