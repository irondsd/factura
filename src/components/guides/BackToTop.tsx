"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";

// The guides are the longest pages on the site — a listing of every article, or
// five to ten screens of a single column of prose — and the only way back to
// their beginning is a long thumb drag. The sticky header comes along for the
// ride, but it holds the site nav, not the top of what you're reading.
//
// Hysteresis rather than one threshold. It appears once a whole viewport has
// gone by — before that the top is a flick away and the button would just be
// furniture — and only leaves once the reader is back within half a viewport of
// it. A single line would flicker the button on and off for anyone reading
// right at it.
const SHOW_AFTER = 1; // viewports scrolled
const HIDE_BELOW = 0.5;

export function BackToTop() {
  const [shown, setShown] = useState(false);
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");

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

  return (
    <button
      type="button"
      // Blurring hands focus back to the document body, so the next Tab starts
      // from the top of the page — where the reader now is — instead of from a
      // button that just faded out under them.
      onClick={(e) => {
        window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
        e.currentTarget.blur();
      }}
      // The fade only works if the element stays mounted, which would otherwise
      // leave an invisible button in the tab order and in the screen reader's
      // page. `inert` takes it out of both for as long as it's hidden.
      inert={!shown}
      aria-label="Volver arriba"
      title="Volver arriba"
      className={[
        // Sits below the sticky header's z-40 — the two never overlap, and if
        // the mobile menu ever grows a scrim this stays under it.
        "fixed bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center",
        "border border-line bg-card text-muted shadow-pop",
        "transition-[opacity,transform,color,border-color] duration-200 ease-out",
        "hover:border-accent hover:text-accent",
        shown
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      ].join(" ")}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 14 6-6 6 6" />
      </svg>
    </button>
  );
}
