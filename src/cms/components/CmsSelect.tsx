"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../icons";
import { inputClass } from "./fields/controls";

// The console's dropdown.
//
// Not a `<select>`. A styled native select gets you the box and nothing else:
// the browser draws the menu, and on macOS it draws it *over* the control —
// the open list covers the field you clicked, the chosen row sitting where the
// field used to be. On a console whose whole vocabulary is square corners,
// hairlines and one accent, the popup then arrives as a rounded translucent
// system menu with a blue highlight. The arrow could be replaced; the menu
// could not.
//
// So this is the ARIA select-only combobox: a button that owns the field's
// chrome, and a listbox this file draws and positions. Keyboard focus never
// leaves the button — the active row is pointed at with `aria-activedescendant`
// — which is what keeps this usable inside `CmsModal` without a second focus
// trap fighting the first.
//
// The listbox is portalled and `position: fixed`. Inline it would be clipped by
// the first scrolling ancestor, and there are two of those in the console: the
// modal panel (`overflow-auto`) and the editor's sidebar. Fixed positioning
// means the measurement has to be redone whenever the field moves, which the
// frame loop below does — see `useAnchoredTo`.

export type CmsSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** Where the listbox goes: pinned under the trigger, or above it when the room
 * below has run out. `top` and `bottom` are exclusive — anchoring the flipped
 * panel by its bottom edge is what lets it grow upwards without knowing its own
 * height first. */
type Placement = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

/** Below this there is not enough room to be worth opening downwards, so the
 * panel flips even though some space remains. */
const MIN_ROOM = 168;
const MAX_PANEL = 288;
/** Between the field and the panel, and between the panel and the viewport. */
const GAP = 4;
const EDGE = 8;

function measure(trigger: HTMLElement): Placement {
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  // Downwards is the default and only loses when it is both cramped and worse
  // than the alternative — a panel that flips whenever it is marginally taller
  // upwards would jump between sides as the page scrolls.
  const down = below >= MIN_ROOM || below >= above;

  return {
    left: rect.left,
    width: rect.width,
    maxHeight: Math.min(MAX_PANEL, Math.max(down ? below : above, 0)),
    ...(down
      ? { top: rect.bottom + GAP }
      : { bottom: window.innerHeight - rect.top + GAP }),
  };
}

const samePlacement = (a: Placement | null, b: Placement): boolean =>
  a !== null &&
  a.left === b.left &&
  a.width === b.width &&
  a.top === b.top &&
  a.bottom === b.bottom &&
  a.maxHeight === b.maxHeight;

const enabledIndexes = (options: readonly CmsSelectOption[]): number[] =>
  options.flatMap((option, index) => (option.disabled ? [] : [index]));

export function CmsSelect({
  value,
  onChange,
  options,
  id,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  /** The chosen option's `value`. Called only on an actual change of value. */
  onChange: (value: string) => void;
  /** Including the empty one: "no filter", "ninguna", "sin colección" are
   * options like any other, and spelling them here keeps the control from
   * having an opinion about what an empty value means. */
  options: readonly CmsSelectOption[];
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${generatedId}-listbox`;

  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openList = useCallback(
    (start: "selected" | "first" | "last") => {
      if (disabled || options.length === 0) return;
      const enabled = enabledIndexes(options);
      if (enabled.length === 0) return;
      const from =
        start === "selected" &&
        selectedIndex >= 0 &&
        !options[selectedIndex].disabled
          ? selectedIndex
          : start === "last"
            ? enabled[enabled.length - 1]
            : enabled[0];
      if (trigger.current) setPlacement(measure(trigger.current));
      setActiveIndex(from);
      setOpen(true);
    },
    [disabled, options, selectedIndex],
  );

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      close();
      // Only a real change: the callers rewrite a URL or mark a page dirty, and
      // re-picking what was already picked is not an edit.
      if (option && !option.disabled && option.value !== value) {
        onChange(option.value);
      }
    },
    [close, onChange, options, value],
  );

  // Re-measure every frame the list is open.
  //
  // Scroll and resize listeners were the first version of this and they miss
  // things: the field also moves when a validation message appears above it,
  // when the sidebar reflows, or when an ancestor scrolls in a way that doesn't
  // reach the window. A panel pinned to a stale rectangle is worse than the
  // native menu this replaces, so the position is simply recomputed while it is
  // on screen — a `getBoundingClientRect` per frame, for the second or two
  // anyone holds a dropdown open, and the state only changes when the numbers
  // do so there is no render per frame.
  useEffect(() => {
    if (!open) return;
    let frame = requestAnimationFrame(function tick() {
      if (trigger.current) {
        const next = measure(trigger.current);
        setPlacement((current) =>
          samePlacement(current, next) ? current : next,
        );
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Anything outside both parts closes it. `mousedown` rather than `click`, so
  // pressing on the page behind dismisses before that press turns into a click
  // on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || list.current?.contains(target)) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [close, open]);

  // Escape has to be taken before `useModalChrome` sees it, or closing the
  // dropdown would close the dialog it is standing in. That listener captures
  // on `document`; capturing on `window` runs first, whichever mounted first.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [close, open]);

  // Keep the active row in view — a list opened on its 30th option should show
  // it, and arrowing past the edge should follow.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    list.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Typeahead: the letters you press jump to the option starting with them, and
  // the buffer resets when you stop typing. Matching what a native select does
  // is the point — it is the one habit people bring to a dropdown.
  const typed = useRef({ buffer: "", at: 0 });
  const typeahead = useCallback(
    (char: string) => {
      const now = Date.now();
      const buffer =
        now - typed.current.at > 500 ? char : typed.current.buffer + char;
      typed.current = { buffer, at: now };

      const from = (open ? activeIndex : selectedIndex) + 1;
      const order = [
        ...options.slice(from),
        ...options.slice(0, Math.max(from, 0)),
      ];
      const hit = order.find(
        (option) =>
          !option.disabled &&
          option.label.toLowerCase().startsWith(buffer.toLowerCase()),
      );
      if (!hit) return;
      const index = options.indexOf(hit);
      if (open) setActiveIndex(index);
      else commit(index);
    },
    [activeIndex, commit, open, options, selectedIndex],
  );

  const move = (delta: number) => {
    const enabled = enabledIndexes(options);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(activeIndex);
    const next =
      at < 0 ? 0 : Math.min(Math.max(at + delta, 0), enabled.length - 1);
    setActiveIndex(enabled[next]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!open) {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case " ":
          event.preventDefault();
          openList("selected");
          return;
        case "Home":
          event.preventDefault();
          openList("first");
          return;
        case "End":
          event.preventDefault();
          openList("last");
          return;
      }
      // A bare letter picks without opening, like a closed native select.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        typeahead(event.key);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        return move(1);
      case "ArrowUp":
        event.preventDefault();
        return move(-1);
      case "Home":
        event.preventDefault();
        return setActiveIndex(enabledIndexes(options)[0] ?? -1);
      case "End": {
        event.preventDefault();
        const enabled = enabledIndexes(options);
        return setActiveIndex(enabled[enabled.length - 1] ?? -1);
      }
      case "Enter":
      case " ":
        event.preventDefault();
        return commit(activeIndex);
      case "Tab":
        // Committing on the way out is what the APG's select-only combobox
        // does, and Tab keeps moving.
        return commit(activeIndex);
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          typeahead(event.key);
        }
    }
  };

  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        // The listbox is portalled, so it is not a DOM descendant of this
        // button. `aria-owns` is what re-parents it for assistive technology,
        // and without it `aria-activedescendant` has nothing to point into.
        aria-owns={open ? listId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        onClick={() => (open ? close() : openList("selected"))}
        onKeyDown={onKeyDown}
        className={cn(
          inputClass,
          "flex min-h-11 cursor-pointer items-center gap-2 pr-3 text-left disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0",
          open && "border-accent",
          className,
        )}
      >
        {/* The value is truncated rather than allowed to widen the field: these
            sit in a sidebar and a modal, both of which are as wide as they are
            going to get. */}
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? value}
        </span>
        <CmsIcon
          name="chevronDown"
          size="sm"
          className={cn(
            "shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        placement &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            style={{
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight,
            }}
            // Above `CmsModal`'s own layer: a dropdown inside a dialog has to
            // draw over it, not behind it.
            className="fixed z-[110] m-0 list-none overflow-y-auto overscroll-contain border border-line bg-card p-0 shadow-pop"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  data-index={index}
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  // Keeps focus on the trigger, which is what
                  // `aria-activedescendant` requires and what makes the
                  // keyboard keep working after a click.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => !option.disabled && commit(index)}
                  className={cn(
                    "flex h-7 cursor-pointer items-center gap-2 px-3 py-2 font-mono text-[13.5px] leading-[1.4] sm:min-h-0 transition-colors",
                    option.disabled
                      ? "cursor-not-allowed text-muted opacity-50"
                      : index === activeIndex
                        ? "bg-muted text-paper"
                        : "text-ink",
                  )}
                >
                  {/* The tick holds its column whether or not it is drawn, so
                      the labels line up instead of shifting by 20px on the one
                      selected row. */}
                  <span className="w-3.5 shrink-0">
                    {isSelected && <CmsIcon name="check" size="xs" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
