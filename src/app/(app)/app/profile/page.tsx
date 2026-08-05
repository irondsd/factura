"use client";

import { signOut, useSession } from "next-auth/react";
import posthog from "posthog-js";
import { BackOffice } from "@/components/app/BackOffice";
import { DangerZone } from "@/components/app/DangerZone";
import { ProfileStats } from "@/components/app/ProfileStats";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Avatar, Button } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitch } from "@/i18n/LanguageSwitch";

export default function ProfilePage() {
  const { data: session } = useSession();
  const { t } = useI18n();
  const tp = t.profile;

  const user = session?.user;
  const name = user?.name ?? user?.email ?? tp.you;

  return (
    <div className="mx-auto max-w-[52rem] px-5 pt-8 pb-20">
      <Eyebrow>{tp.eyebrow}</Eyebrow>
      <Display size={34} className="block mt-1.5">
        {tp.title}
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
            {user?.email ? " · " : ""}
            {tp.viaGoogle}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            posthog.reset();
            signOut({ callbackUrl: "/" });
          }}
        >
          {tp.signOut}
        </Button>
      </div>

      {/* the account's own record — heading and all, hidden until there is a
          ledger to describe */}
      <ProfileStats />

      {/* language — a two-segment switch, its invitation always readable from
          the language you're stuck in */}
      <h2 className="mt-10 mb-2.5">
        <Eyebrow>{tp.language.eyebrow}</Eyebrow>
      </h2>
      <LanguageSwitch />

      {/* the pages this one hands off to, each with its own live count */}
      <BackOffice />

      <DangerZone />
    </div>
  );
}
