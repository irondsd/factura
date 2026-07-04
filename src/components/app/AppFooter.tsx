"use client";

import Link from "next/link";
import { githubUrl } from "@/config/urls";
import { useI18n } from "@/i18n/I18nProvider";

// Minimal footer for the signed-in app. GitHub is currently the only external
// link worth surfacing here; add more as they come up.
export function AppFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-line py-5 px-5">
      <div className="mx-auto flex max-w-[64rem] items-center justify-between">
        <span className="font-display font-semibold text-sm tracking-tight text-ink">
          Factura<span className="text-accent">.</span>
        </span>
        <Link
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-micro uppercase tracking-label-wide text-muted no-underline transition-colors hover:text-ink"
        >
          {t.nav.github}
        </Link>
      </div>
    </footer>
  );
}
