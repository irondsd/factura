import { AppShell } from "@/components/app/AppShell";
import { Providers } from "@/providers/Providers";
import "./globals.css";
import { fraunces, plexMono } from "../config/fonts";
import { metadata, viewport } from "../config/meta";

export { metadata, viewport };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
