import { notFound } from "next/navigation";
import { BackToTop } from "@/components/article/BackToTop";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";

// Shared chrome for the three Spanish-only public content sections. Keeping the
// locale guard here prevents the layouts from drifting as new sections are
// added while leaving each section responsible only for its active nav path.
export async function ContentChrome({
  active,
  lang,
  children,
}: {
  active: string;
  lang: string;
  children: React.ReactNode;
}) {
  if (lang !== "es") notFound();

  return (
    <>
      <SiteHeader active={active} locale="es" />
      {children}
      <SiteFooter locale="es" showLanguageSwitch={false} />
      <BackToTop />
    </>
  );
}
