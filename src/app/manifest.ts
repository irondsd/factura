import type { MetadataRoute } from "next";
import { SHARE_ACTION } from "@/lib/shareTarget";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identity for the installed app, independent of start_url changes.
    id: "/",
    name: "Factura",
    short_name: "Factura",
    description:
      "Factura is your bill ledger for tracking PDF bills, utilities, and household expenses.",
    // Installed users are past the marketing landing: launch straight into the
    // app (signed out, its auth gate forwards to /login and back). ?source=pwa
    // tags launches for analytics. Scope stays "/" so /login and site pages
    // opened from the app remain inside the standalone window.
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    // Puts Factura in the Android share sheet for PDFs, so a bill can go from
    // the bank's app straight into the ledger without the download → open →
    // upload detour. Files require a POST, whose multipart body is caught by
    // the service worker (see public/sw.js) rather than by a route handler —
    // the POST is a cross-site navigation, so the SameSite=Lax session cookie
    // wouldn't ride along with it. Chromium-only: WebKit has never shipped
    // share_target, so iOS keeps using the upload button.
    share_target: {
      // Imported, not spelled out: this is the copy production actually obeys,
      // and a rename here with the worker left behind kills the feature with
      // every test still green.
      action: SHARE_ACTION,
      method: "POST",
      enctype: "multipart/form-data",
      // `accept` is what keeps Factura out of the share sheet for photos and
      // links — it's only offered for the PDFs it can actually ingest.
      params: {
        files: [{ name: "file", accept: ["application/pdf", ".pdf"] }],
      },
    },
    background_color: "#f3efe6",
    theme_color: "#1f1a17",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
