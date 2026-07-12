import type { MetadataRoute } from "next";

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
