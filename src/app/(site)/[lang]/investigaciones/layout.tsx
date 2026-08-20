import { ContentChrome } from "@/components/article/ContentChrome";
import { investigaciones } from "@/content/sections";

export default async function InvestigacionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <ContentChrome active={investigaciones.base} lang={lang}>
      {children}
    </ContentChrome>
  );
}
