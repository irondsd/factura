"use client";

import { useEffect, useState } from "react";

// Whether the reader has scrolled far enough into a long page for the floating
// controls (back-to-top, the suggestion button) to earn their corner.
//
// Hysteresis rather than one threshold. True once a whole viewport has gone by
// — before that the top is a flick away and a floating button would just be
// furniture — and false again only once the reader is back within half a
// viewport of it. A single line would flicker the buttons on and off for anyone
// reading right at it.
const SHOW_AFTER = 1; // viewports scrolled
const HIDE_BELOW = 0.5;

export function useScrolledPast(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const screen = window.innerHeight;
      setShown((was) =>
        was ? y > screen * HIDE_BELOW : y > screen * SHOW_AFTER,
      );
    };

    // Scroll fires far faster than the two states this can be in; coalescing to
    // one read per frame keeps the listener off the critical path, and reading
    // `scrollY` inside the frame avoids a layout thrash mid-scroll.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    // A reload restores the previous scroll position without firing `scroll`,
    // so measure once on mount too.
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return shown;
}
