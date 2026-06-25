"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Avatar, Button } from "@/components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();

  const user = session?.user;
  const name = user?.name ?? user?.email ?? "You";

  const help = "font-mono text-xs text-muted mb-3 max-w-[520px] leading-[1.6]";

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <Eyebrow>Profile</Eyebrow>
      <Display size={34} className="block mt-1.5">
        Your setup
      </Display>

      {/* account identity */}
      <div className="mt-[22px] flex flex-wrap items-center gap-4 border border-line bg-card p-4">
        <Avatar name={name} size={44} className="text-sm" />
        <div className="flex-1 min-w-[160px]">
          <p className="font-display font-semibold text-lg tracking-tight">
            {name}
          </p>
          <p className="font-mono text-xs text-muted mt-0.5">
            {user?.email}
            {user?.email ? " · " : ""}via Google
          </p>
        </div>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </Button>
      </div>

      {/* properties — manage on the dedicated page */}
      <h2 className="mt-10 mb-1">
        <Eyebrow>properties</Eyebrow>
      </h2>
      <p className={help}>
        Your properties hold their bills, vendors and accounts. Invite a partner
        or flatmate so they can see and add bills too.
      </p>
      <Button variant="outline" onClick={() => router.push("/app/properties")}>
        Manage properties →
      </Button>

      {/* parsers — link out to the dedicated library (power-user surface) */}
      <h2 className="mt-10 mb-1">
        <Eyebrow>Parsers</Eyebrow>
      </h2>
      <p className={help}>
        Parsers turn bill PDFs into structured data. Manage your own, publish
        them, or adopt others&apos; — most people never need to touch this.
      </p>
      <Button variant="outline" onClick={() => router.push("/app/parsers")}>
        Manage parsers →
      </Button>
    </div>
  );
}
