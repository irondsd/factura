import "../globals.css";
import type { Metadata } from "next";
import { fraunces, plexMono } from "@/config/fonts";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/I18nProvider";
import { pickNamespaces } from "@/i18n/namespaces";

export const metadata: Metadata = {
  title: "Visualización — Factura",
  robots: { index: false, follow: false },
};

export default async function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dictionary = await getDictionary("es");

  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <I18nProvider
          locale="es"
          dictionary={pickNamespaces(dictionary, ["charts"])}
        >
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
