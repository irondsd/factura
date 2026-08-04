"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import posthog from "posthog-js";
import { ProfileStats } from "@/components/app/ProfileStats";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Avatar, Button } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitch } from "@/i18n/LanguageSwitch";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useI18n();
  const tp = t.profile;

  const user = session?.user;
  const name = user?.name ?? user?.email ?? tp.you;

  const help = "font-mono text-xs text-muted mb-3 max-w-[520px] leading-[1.6]";

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

      {/* language — Phase 1: simple switch to the opposite language */}
      <h2 className="mt-10 mb-1">
        <Eyebrow>{tp.language.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tp.language.help}</p>
      <LanguageSwitch />

      {/* properties — manage on the dedicated page */}
      <h2 className="mt-10 mb-1">
        <Eyebrow>{tp.properties.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tp.properties.help}</p>
      <Button variant="outline" onClick={() => router.push("/app/properties")}>
        {tp.properties.manage}
      </Button>

      {/* parsers — link out to the dedicated library (power-user surface) */}
      <h2 className="mt-10 mb-1">
        <Eyebrow>{tp.parsers.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tp.parsers.help}</p>
      <Button variant="outline" onClick={() => router.push("/app/parsers")}>
        {tp.parsers.manage}
      </Button>

      {/* sessions — every browser holding a key to this account */}
      <h2 className="mt-10 mb-1">
        <Eyebrow>{tp.sessions.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tp.sessions.help}</p>
      <Button variant="outline" onClick={() => router.push("/app/sessions")}>
        {tp.sessions.manage}
      </Button>

      {/* danger — the deletion itself lives on its own page, outside the app
          shell, so the confirmation survives the session it destroys */}
      <h2 className="mt-14 mb-1">
        <Eyebrow tone="accent">{tp.danger.eyebrow}</Eyebrow>
      </h2>
      <p className={help}>{tp.danger.help}</p>
      <Button
        variant="outline"
        className="border-accent text-accent"
        onClick={() => router.push("/delete-account")}
      >
        {tp.danger.manage}
      </Button>
    </div>
  );
}
