import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appPageMetadata } from "@/lib/seo";

// Title-only layout: the page itself is a client component and can't export
// `generateMetadata`. Everything else (noindex, OG defaults) is inherited.
export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("builder");
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
