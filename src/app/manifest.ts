import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Factura",
    short_name: "Factura",
    description:
      "Factura is your bill ledger for tracking PDF bills, utilities, and household expenses.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#1f1a17",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
