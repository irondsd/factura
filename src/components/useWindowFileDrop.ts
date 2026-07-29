"use client";

import { useEffect, useRef, useState } from "react";

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

    const onDragEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    // Guarded by the same check as enter, so a text or link drag can't
    // decrement a counter it never incremented and strand `dragging` on.
    const onDragLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
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
