import { ContentChrome } from "@/components/article/ContentChrome";
import { noticias } from "@/content/sections";

export default async function NoticiasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <ContentChrome active={noticias.base} lang={lang}>
      {children}
    </ContentChrome>
  );
}
