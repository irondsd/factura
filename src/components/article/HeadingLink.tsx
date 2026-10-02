"use client";

import { useEffect, useState } from "react";
import { publicOrigins } from "@/config/origins";
import { cn } from "@/lib/cn";

// The "copy link to this section" glyph after an article's h2. Hidden until the
// heading is hovered (the h2 carries `group`), or the button itself takes
// keyboard focus, so it never adds furniture to a page a reader is just reading.
//
// The link is the page's path on the public origin plus the heading's id — the
// same rule as the share menu's "Copiar enlace", so a copied section link never
// carries the reader's query string or a preview host.

/** How long the check mark stays before the glyph goes back to a link. */
const COPIED_MS = 2000;

export function HeadingLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    const url = new URL(
      `${window.location.pathname}#${id}`,
      publicOrigins.siteOrigin,
    ).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The clipboard refused (insecure origin, denied permission, a webview
      // without it): put the anchor in the address bar to copy by hand.
      history.replaceState(null, "", `#${id}`);
    }
  }

  return (
    // The word joiner glues the button to the heading's last word, so a long
    // title never wraps the glyph onto a line of its own.
    <span className="whitespace-nowrap">
      &#8288;
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Enlace copiado" : "Copiar enlace a esta sección"}
        title={copied ? "Enlace copiado" : "Copiar enlace a esta sección"}
        className={cn(
          "ml-2 inline-flex size-7 translate-y-[-3px] cursor-pointer items-center justify-center border-none bg-transparent p-0 align-middle text-muted opacity-0 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100",
          copied && "text-accent opacity-100",
        )}
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
      </button>
    </span>
  );
}

function LinkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
