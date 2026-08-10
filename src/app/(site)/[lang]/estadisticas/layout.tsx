import { notFound } from "next/navigation";
import { BackToTop } from "@/components/article/BackToTop";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";

// The statistics section is Spanish-only, like the guides: the numbers are
// Argentine, the sources publish in Spanish, and the audience searches in
// Spanish. This subtree guard is the single place that enforces it — the parent
// `[lang]` segment still statically generates both /es/estadisticas and
// /en/estadisticas, but any non-Spanish locale 404s here. Forward-compatible: if
// a page is ever translated, relax this check.
//
// Chrome lives here (not per page) so the header/footer are shared by the index
// and every page under it. The footer hides the language switch (no English to
// go to).
export default async function EstadisticasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (lang !== "es") notFound();

  return (
    <>
      <SiteHeader active="/estadisticas" locale="es" />
      {children}
      <SiteFooter locale="es" showLanguageSwitch={false} />
      {/* These pages are long — fourteen figures on the first one — and the
          header is a long way up by the time a reader reaches the sources. */}
      <BackToTop />
    </>
  );
}
