"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavLink = { href: string; label: string };

/** The header's section links. A client island only to know which one is the
 * current page — the accent and its dotted rule say where you are. */
export function CmsNav({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-5 lg:flex" aria-label="CMS">
      {links.map((link) => {
        const current =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "fd-label no-underline transition-colors",
              current
                ? "text-accent underline decoration-dotted underline-offset-[6px]"
                : "hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
