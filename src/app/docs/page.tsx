import type { Metadata } from "next";
import { SHELL, SiteFoot, SiteTop } from "@/components/landing/chrome";
import { DocsView } from "@/components/landing/DocsView";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Factura documentation — getting started, concepts, and reference.",
  alternates: { canonical: "/docs" },
};

// Public documentation. The interactive TOC + article lives in <DocsView/>
// (client); the page itself just supplies metadata and the shared site chrome.
export default function DocsPage() {
  return (
    <>
      <SiteTop active="/docs" />
      <main className={SHELL}>
        <DocsView />
      </main>
      <SiteFoot />
    </>
  );
}
