"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";

// Trustpilot's "Review Collector" TrustBox — the "Review us on Trustpilot"
// button under the footer wordmark. The ids are the ones Trustpilot's TrustBox
// editor issues for this widget; they are public (they ship in the page HTML),
// not secrets.
//
// The bootstrap script scans the DOM for `.trustpilot-widget` once, when it
// loads. That covers the first page a reader lands on, but the footer is
// re-rendered on every client-side navigation and the new element would stay
// the bare fallback link. So a remount asks the already-loaded bootstrap to
// render this element itself. `next/script` dedupes by src, so the script is
// fetched once per visit however many pages are opened.
//
// The widget is an iframe Trustpilot draws (white box, green border); its
// look is theirs to set, so nothing here restyles it — only the width it
// gets in the brand column. The template centres the button in the iframe and
// ignores `data-style-alignment`, so the box is kept close to the button's
// width to keep it near the wordmark's left edge. Below ~220px the template
// switches to a stacked two-line layout, so don't narrow it further.

const TRUSTBOX = {
  templateId: "56278e9abfbbba0bdcd568bc",
  businessUnitId: "6abba724336ccac92a2b2551",
  token: "70a5517b-281a-4f36-8de6-bd87258b7007",
} as const;

const BY_LOCALE: Record<Locale, { locale: string; reviewUrl: string }> = {
  es: {
    locale: "es-ES",
    reviewUrl: "https://es.trustpilot.com/review/factura.uno",
  },
  en: {
    locale: "en-US",
    reviewUrl: "https://www.trustpilot.com/review/factura.uno",
  },
};

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: HTMLElement, forceReload?: boolean) => void;
    };
  }
}

export function TrustpilotReviewCollector({ locale }: { locale: Locale }) {
  const ref = useRef<HTMLDivElement>(null);
  const { locale: widgetLocale, reviewUrl } = BY_LOCALE[locale];

  useEffect(() => {
    // Absent on the first page view: the bootstrap is still loading and will
    // find this element on its own scan.
    if (ref.current && window.Trustpilot) {
      window.Trustpilot.loadFromElement(ref.current, true);
    }
  }, [widgetLocale]);

  return (
    <div className="w-[225px] max-w-full">
      <Script
        src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
        strategy="afterInteractive"
      />
      <div
        ref={ref}
        className="trustpilot-widget"
        data-locale={widgetLocale}
        data-template-id={TRUSTBOX.templateId}
        data-businessunit-id={TRUSTBOX.businessUnitId}
        data-style-height="52px"
        data-style-width="100%"
        data-token={TRUSTBOX.token}
      >
        <a href={reviewUrl} target="_blank" rel="noopener noreferrer">
          Trustpilot
        </a>
      </div>
    </div>
  );
}
