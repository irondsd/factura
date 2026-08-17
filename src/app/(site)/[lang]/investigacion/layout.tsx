import { ContentChrome } from "@/components/article/ContentChrome";
import { investigacion } from "@/content/investigacion/pages";

export default async function InvestigacionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <ContentChrome active={investigacion.base} lang={lang}>
      {children}
    </ContentChrome>
  );
}
