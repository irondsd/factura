import type { ReactNode } from "react";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { DemoTopBar } from "@/components/demo/DemoTopBar";
import { SiteFoot } from "@/components/landing/chrome";

// Public, indexable demo of the signed-in app rendered on static sample data.
// Deliberately NOT under the /app auth gate — no session, no DB, no tRPC — so
// search engines and visitors can explore the product without signing in.
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoTopBar />
      <DemoBanner />
      <main className="w-full">{children}</main>
      <SiteFoot />
    </>
  );
}
