import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { appSectionMetadata } from "@/lib/seo";

// A server layout wrapping the client shell, so the segment can carry metadata:
// `AppShell` needs the session, the router and tRPC, and a "use client" module
// can't export `generateMetadata`.
//
// The title is the overview's — this segment's own page. The deeper pages set
// theirs from their own layouts, for the same reason (they're client
// components too). `robots: noindex` comes from the (app) root layout.
export function generateMetadata(): Promise<Metadata> {
  return appSectionMetadata("overview");
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
