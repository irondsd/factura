"use client";

import { useEffect } from "react";

// What the preview renders where a component the body calls does not exist yet
// (`compileContentForPreview`): nothing, plus one line in the browser console.
//
// Nothing, because the alternative — a placeholder box in the flow — would
// change the layout of the very thing being previewed, and the point of the
// preview is to show the page as it will be. The console line is for whoever is
// looking at a gap and wondering; the editor's Validation tab is where this is
// reported properly, and it still reports it as an error.

export function MissingComponent({ name }: { name: string }) {
  useEffect(() => {
    console.error(
      `[cms] <${name}> is not a registered content component, so nothing was rendered in its place. The page will show it once the component ships.`,
    );
  }, [name]);

  return null;
}
