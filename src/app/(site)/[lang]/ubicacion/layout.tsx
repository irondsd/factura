import { ContentChrome } from "@/components/article/ContentChrome";

export default async function UbicacionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  return (
    <ContentChrome active="/ubicacion" lang={(await params).lang}>
      {children}
    </ContentChrome>
  );
}
