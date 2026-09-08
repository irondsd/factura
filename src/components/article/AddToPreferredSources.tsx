"use client";

import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import { Eyebrow } from "@/components/landing/parts";
import { publicOrigins } from "@/config/origins";
import type { ContentSection } from "@/content-system/types";

// The "add us to your preferred sources in Google" block, at the foot of every
// content page.
//
// WHAT IT IS. Google lets a reader nominate a domain as a *preferred source*.
// That site's articles then show up more often in Noticias destacadas, in AI
// Mode and in AI Overviews, badged as preferred. Eligibility is domain-level —
// factura.uno as a whole, never /noticias — which is why this asks for the site
// and not for the page it happens to sit on.
//
// HOW IT RENDERS. Google's library paints the button into a *shadow root* on
// the slot below, so the look is Google's and none of our CSS reaches it. That
// is the point rather than a limitation: it's a Google affordance and a reader
// should recognise it as one at a glance. The two things we do control are the
// theme and the language, both set as data attributes on the slot.
//
// WHY IT'S DEFERRED. `publisher.js` is 138 KB, which is a great deal to spend
// on a block that lives below several screens of prose. It's fetched only once
// the block comes within ~600px of the viewport, so the reader who bounces at
// the intro never pays for it — and a page nobody scrolls costs nothing.
const LIBRARY = "https://news.google.com/swg/js/v1/publisher.js";
const NEAR_VIEWPORT = "600px";

/** The no-JavaScript address of the same flow. Google documents it as the
 * fallback for publishers who can't run the library; here it's the fallback for
 * readers whose browser won't. See the slot below for how it hides itself.
 *
 * The host comes from the configured site origin rather than a literal, for the
 * same reason the library reads `location.hostname`: the thing being nominated
 * is the domain the reader is on. */
const DEEPLINK = `https://www.google.com/preferences/source?q=${encodeURIComponent(
  new URL(publicOrigins.siteOrigin).hostname,
)}`;

/** The library's callback queue. Before the script loads this is a plain array
 * that the script drains on arrival; afterwards it's an object whose `push`
 * invokes the callback on the spot. Pushing is correct in both states, which is
 * the whole reason it exists. */
declare global {
  interface Window {
    PREFERRED_SOURCE?:
      | ((api: PreferredSourceApi) => void)[]
      | { push: (cb: (api: PreferredSourceApi) => void) => void };
  }
}

type PreferredSourceApi = {
  init: (options: { theme?: "light" | "dark"; lang?: string }) => void;
  addPreferredSource: () => void;
};

export function AddToPreferredSources({
  section,
}: {
  /** Which section the reader was in, so the click can be told apart from the
   * same click on a guía. Optional — the CMS preview renders this shell too. */
  section?: ContentSection;
}) {
  const slot = useRef<HTMLDivElement>(null);

  // Load on approach, not on mount. `rootMargin` buys the fetch a head start,
  // so the button is painted by the time the block is actually read instead of
  // popping in under the reader's eyes. Deliberately no state: whether the
  // library has been asked for is not something the render depends on, and a
  // `setArmed` here would only re-render the block to produce identical markup.
  useEffect(() => {
    const el = slot.current;
    if (!el) return;

    let requested = false;
    const load = () => {
      if (requested) return;
      requested = true;

      // One copy per document. The tag survives client-side navigation, so the
      // second article a reader opens finds the library already there.
      if (!document.querySelector(`script[src="${LIBRARY}"]`)) {
        const tag = document.createElement("script");
        tag.async = true;
        tag.src = LIBRARY;
        document.head.appendChild(tag);
      }

      // WHY init() IS CALLED AT ALL, given the library auto-scans on load: it
      // scans exactly once and there is no MutationObserver behind it — a slot
      // that appears later stays blank forever. On a cold load our slot is in
      // the server-rendered HTML and that scan finds it; after a client-side
      // navigation to the next article the library loaded long ago and only
      // this re-scan will. `init()` skips slots already carrying
      // `data-initialized`, so the two paths converge rather than double-render.
      const queue = (window.PREFERRED_SOURCE ??= []);
      queue.push((api) => api.init({ theme: "light", lang: "es" }));
    };

    // No observer (a browser old enough to lack one) means we simply load it:
    // a missing optimisation, not a missing button.
    if (typeof IntersectionObserver !== "function") {
      load();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        load();
      },
      { rootMargin: NEAR_VIEWPORT },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Intent, not outcome. A click inside a shadow root is `composed`, so it
  // crosses the boundary and reaches this handler retargeted to the slot —
  // which is as far as we can see. The library reports nothing back about what
  // the reader then did in Google's popup (`addPreferredSource` returns void
  // and the confirmation happens on Google's side), so this counts people who
  // asked for the dialog and deliberately claims no more than that.
  const trackClick = (variant: "button" | "deeplink") => {
    posthog.capture("preferred_source_clicked", {
      variant,
      section: section ?? null,
    });
  };

  return (
    <aside className="mt-12 flex flex-col gap-4 border border-line bg-card px-5 py-5 sm:flex-row sm:items-center sm:gap-7">
      {/* `flex-1` rather than the natural width: without it the copy column
          keeps its shrink-to-fit size, the row's spare space collects between
          the paragraph and the button, and five lines of mono wrap in a column
          half the width they could have had. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Eyebrow>En Google</Eyebrow>
        <p className="m-0 font-display font-semibold text-[19px] leading-[1.2] tracking-tight text-ink">
          ¿Te sirvió esta página?
        </p>
        {/* Says what the reader gets, not what we get, and names the two
            surfaces so the ask is concrete. The undo is the one objection
            someone hesitating over a Google dialog actually has, and it costs
            a clause. Four lines at this column width — mono is wide, and the
            block sits under a finished article, not in front of one. */}
        <p className="m-0 font-mono text-[13.5px] leading-[1.6] text-pretty text-muted">
          Agregá Factura a tus fuentes preferidas de Google y vas a ver nuestras
          notas más seguido en Noticias destacadas y en las respuestas con IA.
          Podés deshacerlo cuando quieras.
        </p>
      </div>

      {/* The slot Google's library claims. Two things are load-bearing here:
          the height is reserved so the button's arrival doesn't shift the
          paragraph above it, and the link *inside* is the fallback — once the
          library attaches its shadow root the link stays in the DOM but is
          never slotted, so it renders nothing at all. A reader who blocks
          news.google.com keeps a working way in; everyone else sees only the
          button, and neither state needs a flag to tell them apart. */}
      <div
        ref={slot}
        google-add-preferred-source-btn=""
        data-theme="light"
        data-lang="es"
        onClick={() => trackClick("button")}
        // `inline-flex` + `self-start` so the box hugs the button instead of
        // spanning the column: stacked on a phone that keeps it on the text's
        // left margin, and — since the click handler is on this element and a
        // click inside the shadow root reaches it retargeted — it also means
        // there is no dead strip beside the button that would count as one.
        // The reserved 40px is the button's own height, so its arrival doesn't
        // shift the paragraph above it.
        className="inline-flex min-h-10 min-w-[140px] items-center self-start sm:flex-none sm:self-auto"
      >
        <a
          href={DEEPLINK}
          target="_blank"
          rel="noopener"
          onClick={(e) => {
            e.stopPropagation();
            trackClick("deeplink");
          }}
          className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-accent"
        >
          Añadir a fuentes preferidas ↗
        </a>
      </div>
    </aside>
  );
}
