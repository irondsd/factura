import Script from "next/script";

/**
 * Ahrefs Web Analytics — the pageview counter that feeds the traffic side of
 * the Ahrefs project for this site.
 *
 * Ahrefs hands out two versions of the same tag: a bare `<script async>` for
 * the `<head>`, and a Google Tag Manager snippet that builds that element in
 * JavaScript. This deployment has no GTM container (the product analytics are
 * PostHog, loaded from `instrumentation-client.ts`), so adding one purely to
 * host a single third-party tag would buy an extra request and a second place
 * to look. The element goes in directly instead.
 *
 * `afterInteractive` rather than `beforeInteractive`: nothing on the page waits
 * on this, and a counter has no business delaying first paint. The script reads
 * its own `data-key` off `document.currentScript`, which works for the element
 * `next/script` appends — that is exactly what Ahrefs' own GTM snippet does —
 * so the attribute has to stay on the tag and not move to a global.
 *
 * Client-side navigation is handled by the script itself: it wraps
 * `history.pushState` and listens for `popstate`, so a reader moving between
 * guides through `<Link>` is counted without any route-change hook here.
 *
 * Gated on the key, the way PostHog is gated on its project token: an
 * environment that doesn't set one loads nothing at all. That is what keeps
 * `localhost` and preview deployments out of the numbers — whichever
 * deployments have the variable are the ones that report.
 */
export function AhrefsAnalytics() {
  const key = process.env.NEXT_PUBLIC_AHREFS_ANALYTICS_KEY;
  if (!key) return null;

  return (
    <Script
      src="https://analytics.ahrefs.com/analytics.js"
      data-key={key}
      strategy="afterInteractive"
    />
  );
}
