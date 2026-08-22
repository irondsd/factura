import "../globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fraunces, plexMono } from "@/config/fonts";
import { viewport } from "@/config/meta";
import { cmsRootMetadata } from "@/cms/metadata";

export { viewport };

// Root layout for the private publishing console. A third root layout beside
// the public landing's and the app's, on purpose (cms.md): /cms shares the
// site's fonts and design tokens and nothing else. No locale proxy, no i18n
// provider — the CMS is a Spanish-only internal tool for two people, and the
// content it edits is Spanish-only too. No tRPC/session providers either: every
// CMS page is a server component that has already resolved its actor.
export function generateMetadata(): Metadata {
  return cmsRootMetadata();
}

export default function CmsRootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
