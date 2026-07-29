"use client";

import { useEffect, useRef, useState } from "react";

/** The drag-tracking state machine, lifted out of the effect so it can be
 * tested without a DOM.
 *
 * `dragenter`/`dragleave` fire once per element the cursor crosses, not once
 * per page, so "is a drag happening" is a depth count rather than a boolean.
 * Non-file drags are ignored entirely — a text or link drag that decremented a
 * counter it never incremented would strand the affordance on screen.
 *
 * Pure; unit-tested in useWindowFileDrop.test.ts. */
export function dragStep(
  depth: number,
  event: "enter" | "leave" | "drop",
  carriesFiles: boolean,
): { depth: number; dragging: boolean } {
  if (event === "drop") return { depth: 0, dragging: false };
  if (!carriesFiles) return { depth, dragging: depth > 0 };
  // Clamped at zero: a leave without a matching enter (the cursor entered
  // before the listener attached) must not drive the count negative, or the
  // next real enter would leave `dragging` false.
  const next = event === "enter" ? depth + 1 : Math.max(0, depth - 1);
  return { depth: next, dragging: next > 0 };
}

/** Window-wide file drag-and-drop: returns whether a file drag is in progress,
 * and calls `onFiles` when one is dropped anywhere on the page.
 *
 * Two things make this fiddly enough to keep in one place:
 *
 * - `dragenter`/`dragleave` fire once per element the cursor crosses, not once
 *   per page, so tracking "is a drag happening" needs a depth counter. Without
 *   it the affordance flickers off every time the pointer moves over a child.
 * - The browser navigates to a dropped file unless BOTH `dragover` and `drop`
 *   are `preventDefault`ed at the window. That's why they're registered
 *   unconditionally while enabled, not only while `dragging` — a listener added
 *   after the drag starts is already too late.
 *
 * Shared by the signed-in app's DropOverlay and the public /probar page. */
export function useWindowFileDrop({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (disabled) return;

    const carriesFiles = (e: DragEvent) =>
      e.dataTransfer?.types.includes("Files") ?? false;

    const step = (e: DragEvent, event: "enter" | "leave" | "drop") => {
      const next = dragStep(depth.current, event, carriesFiles(e));
      depth.current = next.depth;
      setDragging(next.dragging);
    };

    const onDragEnter = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
      step(e, "enter");
    };
    const onDragLeave = (e: DragEvent) => step(e, "leave");
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      step(e, "drop");
      if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles, disabled]);

  return disabled ? false : dragging;
}
