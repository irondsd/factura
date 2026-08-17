import { notFound } from "next/navigation";
import { BackToTop } from "@/components/article/BackToTop";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";
import type { ContentSection } from "@/content/section";

// The chrome around a registry section — the whole body of both sections'
// `layout.tsx`.
//
// These sections are Spanish-only, like the guides: the numbers are Argentine,
// the sources publish in Spanish, and the audience searches in Spanish. This
// guard is the single place that enforces it — the parent `[lang]` segment still
// statically generates both /es/… and /en/…, but any non-Spanish locale 404s
// here. Forward-compatible: if a page is ever translated, relax this check.
//
// Chrome lives in the layout (not per page) so the header/footer are shared by
// the index and every page under it. The footer hides the language switch (no
// English to go to).
export async function SectionChrome({
  section,
  lang,
  children,
}: {
  section: ContentSection;
  lang: string;
  children: React.ReactNode;
}) {
  if (lang !== "es") notFound();

  return (
    <>
      <SiteHeader active={section.base} locale="es" />
      {children}
      <SiteFooter locale="es" showLanguageSwitch={false} />
      {/* These pages are long — fourteen figures on the first one — and the
          header is a long way up by the time a reader reaches the sources. */}
      <BackToTop />
    </>
  );
}
