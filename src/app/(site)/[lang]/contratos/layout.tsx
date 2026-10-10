import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/landing/Header";
import { SiteFooter } from "@/components/landing/Footer";

export default async function ContractsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  if ((await params).lang !== "es") notFound();
  return (
    <>
      <SiteHeader locale="es" />
      {children}
      <SiteFooter locale="es" showLanguageSwitch={false} />
    </>
  );
}
