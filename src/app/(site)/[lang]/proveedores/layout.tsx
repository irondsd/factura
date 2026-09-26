import { ContentChrome } from "@/components/article/ContentChrome";
import { proveedores } from "@/content/sections";

export default async function ProveedoresLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <ContentChrome active={proveedores.base} lang={lang}>
      {children}
    </ContentChrome>
  );
}
