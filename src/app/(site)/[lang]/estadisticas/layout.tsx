import { ContentChrome } from "@/components/article/ContentChrome";
import { estadisticas } from "@/content/estadisticas/pages";

export default async function EstadisticasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <ContentChrome active={estadisticas.base} lang={lang}>
      {children}
    </ContentChrome>
  );
}
