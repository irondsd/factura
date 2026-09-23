import Link from "next/link";
import type { ReactNode } from "react";
import { CmsIcon } from "../icons";

// The top of an administration page: where it sits (back link and eyebrow),
// what it is, one paragraph on how it behaves, and room for the page's primary
// action on the right. Authors and locations share it so the two read as one
// family of screens.
export function CmsPageHeader({
  back,
  eyebrow,
  title,
  action,
  children,
}: {
  back: { href: string; label: string };
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <Link
        href={back.href}
        className="inline-flex items-center gap-2 font-mono text-micro tracking-label-wide text-muted uppercase no-underline transition-colors hover:text-accent"
      >
        <CmsIcon name="arrowLeft" size="sm" />
        {back.label}
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 font-mono text-micro tracking-label-wide text-accent uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 mb-0 font-display text-[30px] font-semibold tracking-[-0.025em] break-words">
            {title}
          </h1>
        </div>
        {action}
      </div>
      {children && (
        <p className="mt-3 mb-0 max-w-[68ch] font-mono text-[14px] leading-[1.7] text-muted">
          {children}
        </p>
      )}
    </>
  );
}

/** A one-line confirmation after a save that navigated here. */
export function CmsNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="mt-6 mb-0 border-l-2 border-ok py-2 pl-4 font-mono text-[13px] text-ink"
    >
      {children}
    </p>
  );
}

/** The accent link-button a list page offers for "new". */
export function CmsNewLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 border border-accent bg-accent px-3 py-2 font-mono text-micro tracking-label-wide text-paper uppercase no-underline transition-colors hover:border-ink hover:bg-ink"
    >
      <CmsIcon name="add" size="sm" />
      {children}
    </Link>
  );
}
