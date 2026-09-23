import Link from "next/link";
import { CmsIcon, type CmsIconName } from "../icons";

// The compact card in the CMS home's sidebar: the things you administer rather
// than the things you edit. Icon, name, one short line — the longer
// explanation lives in the native tooltip, because a sidebar of six entries
// reads as a menu and a menu does not want a paragraph under every item.
// Always a link: every entry is a page of its own.

type Props = {
  icon: CmsIconName;
  label: string;
  meta: string;
  description: string;
  href: string;
};

const CARD =
  "group flex w-full items-center gap-3 border border-line bg-card px-3.5 py-3 text-ink no-underline transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function CmsToolCard({ icon, label, meta, description, href }: Props) {
  return (
    <Link href={href} title={description} className={CARD}>
      <span className="flex size-9 shrink-0 items-center justify-center border border-line bg-paper text-muted transition-colors group-hover:border-accent group-hover:text-accent">
        <CmsIcon name={icon} size="md" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[16px] font-semibold leading-tight tracking-[-0.01em]">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-mono text-micro uppercase tracking-label-wide text-muted">
          {meta}
        </span>
        {/* `title` is a hover affordance only; screen readers get the same
            sentence here. */}
        <span className="sr-only">{description}</span>
      </span>
    </Link>
  );
}
