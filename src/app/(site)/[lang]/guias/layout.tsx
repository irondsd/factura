import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/landing/Footer";
import { SiteHeader } from "@/components/landing/Header";

// The guides section is Spanish-only. This subtree guard is the single place
// that enforces it: the parent `[lang]` segment still statically generates both
// /es/guias and /en/guias, but any non-Spanish locale 404s here. Forward-
// compatible — if a guide is ever translated, relax this check.
//
// Chrome lives here (not per page) so the header/footer are shared by the index
// and every article. The footer hides the language switch (no English to go to).
export default async function GuiasLayout({
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
      <SiteHeader active="/guias" locale="es" />
      {children}
      <SiteFooter locale="es" showLanguageSwitch={false} />
    </>
  );
}
