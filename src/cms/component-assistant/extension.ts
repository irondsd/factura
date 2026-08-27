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
import styles from "./CompletionTooltip.module.css";

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
      tooltipClass: () => styles.tooltip,
      positionInfo: (_view, list, option, info, space) => {
        const width = info.right - info.left;
        const height = info.bottom - info.top;
        const spaceLeft = list.left - space.left;
        const spaceRight = space.right - list.right;

        // Beside the list whenever the panel fits there, which is CodeMirror's
        // own preference and reads best: nothing is hidden either way.
        if (width <= Math.max(spaceLeft, spaceRight)) {
          const side = spaceRight >= width ? "right" : "left";
          // No scale correction: CodeMirror's own version divides by the
          // tooltip's CSS transform, and the CMS never renders the editor
          // inside a scaled container.
          const top =
            Math.max(space.top, Math.min(option.top, space.bottom - height)) -
            list.top;
          return {
            class: `cm-completionInfo-${side}`,
            style: `top: ${top}px; max-width: ${Math.min(
              400,
              side === "left" ? spaceLeft : spaceRight,
            )}px`,
          };
        }

        // In the CMS's narrow column it has to stack, and this is the part
        // worth writing ourselves: CodeMirror starts the panel under the
        // *highlighted option*, so the rest of the list ends up behind it and
        // the popup reads as half-covered. Anchoring to the list instead keeps
        // both whole, with the stylesheet's margin as the gap between them.
        // The offsets go in the inline style rather than the class: CodeMirror
        // only overwrites `cssText` when `style` is a non-empty string, so a
        // class-only answer would leave the panel parked at the -1e6px it uses
        // to hide itself. The class carries the gap.
        const below = space.bottom - list.bottom >= height;
        const maxWidth = Math.min(400, space.right - list.left);
        return below
          ? {
              class: styles.infoBelow,
              style: `top: 100%; bottom: auto; left: 0; max-width: ${maxWidth}px`,
            }
          : {
              class: styles.infoAbove,
              style: `bottom: 100%; top: auto; left: 0; max-width: ${maxWidth}px`,
            };
      },
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
