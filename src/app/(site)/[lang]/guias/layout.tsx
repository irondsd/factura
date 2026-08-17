import { ContentChrome } from "@/components/article/ContentChrome";
export default async function GuiasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <ContentChrome active="/guias" lang={lang}>
      {children}
    </ContentChrome>
  );
}
