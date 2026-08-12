import { notFound } from "next/navigation";
import { BackToTop } from "@/components/article/BackToTop";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";

// Spanish-only, same rule and same reason as the guides: these are Argentine
// norms, written about in Spanish, for readers in Argentina. The parent `[lang]`
// segment still generates /en/normativa statically, so this guard is what makes
// it 404 rather than render Spanish copy under an English URL.
//
// Chrome lives here rather than in the page so the section can grow a second
// route later without duplicating it. The footer hides the language switch —
// there is no English page to switch to.
export default async function NormativaLayout({
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
      <SiteHeader active="/normativa" locale="es" />
      {children}
      <SiteFooter locale="es" showLanguageSwitch={false} />
      {/* Thirty-odd cards in six sections — the header is a long way up. */}
      <BackToTop />
    </>
  );
}
