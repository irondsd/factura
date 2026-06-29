import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { CtaButton, CtaRow, DemoCta, SignupCta } from "@/components/guides/cta";
import { cn } from "@/lib/cn";

// Global MDX component map — REQUIRED by `@next/mdx` in the App Router. Maps the
// HTML that markdown compiles to onto the site's paper aesthetic (font-display
// headings, font-mono body, accent links/code) so guides need no `prose` plugin.
// Custom components (CTAs) are exposed here too, letting guide `.mdx` use
// <DemoCta/> / <SignupCta/> / <CtaButton/> without an import.

// Internal links use next/link for client nav; external open in a new tab.
function Anchor({
  href = "",
  children,
}: React.ComponentProps<"a">) {
  const cls =
    "text-accent underline decoration-dotted underline-offset-[3px] hover:decoration-solid";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const components: MDXComponents = {
  h2: ({ children, ...p }) => (
    <h2
      {...p}
      className="font-display font-semibold text-[28px] sm:text-[32px] tracking-[-0.02em] leading-[1.15] mt-12 mb-4 scroll-mt-24"
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...p }) => (
    <h3
      {...p}
      className="font-display font-semibold text-[21px] sm:text-[23px] tracking-[-0.015em] mt-9 mb-3 scroll-mt-24"
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...p }) => (
    <h4
      {...p}
      className="font-mono text-[13px] uppercase tracking-label-wide text-muted mt-8 mb-2 scroll-mt-24"
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="font-mono text-[15px] leading-[1.75] text-ink/90 my-5">
      {children}
    </p>
  ),
  a: Anchor,
  ul: ({ children }) => (
    <ul className="font-mono text-[15px] leading-[1.7] text-ink/90 my-5 pl-5 list-disc marker:text-accent space-y-2">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="font-mono text-[15px] leading-[1.7] text-ink/90 my-5 pl-5 list-decimal marker:text-muted space-y-2">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent pl-5 my-6 font-mono text-[15px] leading-[1.7] text-muted italic [&_p]:my-2">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    // Inline code only; fenced blocks arrive wrapped in <pre> (see below).
    <code
      className={cn(
        "font-mono text-[0.9em] bg-[var(--accent-soft)] border border-line px-[5px] py-px text-ink",
        className,
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="font-mono text-[13px] leading-[1.6] bg-[var(--accent-soft)] border border-line p-4 my-6 overflow-x-auto [&_code]:bg-transparent [&_code]:border-0 [&_code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-0 border-t border-line my-10" />,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[14px]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line/60 py-2 pr-4 text-ink/90 align-top">
      {children}
    </td>
  ),
  img: ({ src, alt }) => (
    // Guide imagery is author-supplied static assets; plain <img> keeps MDX
    // simple (no width/height plumbing) and these are below the fold.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} className="my-6 w-full border border-line" />
  ),
  // Custom components available unqualified inside guide MDX:
  CtaButton,
  CtaRow,
  DemoCta,
  SignupCta,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
