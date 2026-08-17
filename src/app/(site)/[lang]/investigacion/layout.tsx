import { SectionChrome } from "@/components/section/SectionChrome";
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
    <SectionChrome section={investigacion} lang={lang}>
      {children}
    </SectionChrome>
  );
}
