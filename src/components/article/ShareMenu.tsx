"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { publicOrigins } from "@/config/origins";
import type { ContentSection } from "@/content-system/types";
import { cn } from "@/lib/cn";

// "Compartir" on every content page. One component, two placements, the same
// split as the table of contents: the route renders it once at the head of the
// sidebar (`lg` up) and once after the article (`lg:hidden`), and hides the
// other copy with the `className` it passes.
//
// On a touch device the button hands off to the system share sheet, which
// already lists every app the reader has — WhatsApp included — in the order
// they use them. Everywhere else, and where `navigator.share` is missing or
// fails, it opens our own short list.
//
// The networks are plain links to their share pages. No SDKs: nothing from
// Facebook or X loads until a reader clicks, so the page sets no third-party
// cookies and needs no consent for them.

type Method = "native" | "whatsapp" | "copy" | "facebook" | "x";

const ITEM =
  "flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3 py-2 text-left font-mono text-[12.5px] leading-[1.45] text-muted no-underline transition-colors hover:bg-paper hover:text-ink";

/** How long "Copiado" stays before the item reads "Copiar enlace" again. */
const COPIED_MS = 2000;

export function ShareMenu({
  href,
  title,
  section,
  className,
}: {
  /** The page's path, e.g. `/guias/edesur`. Joined to the site origin rather
   * than read from `location`, so a shared link never carries the reader's
   * query string, hash or preview host. */
  href: string;
  title: string;
  section?: ContentSection;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // The clipboard refused (an insecure origin, a denied permission, a webview
  // that doesn't expose it): show the address selected, to copy by hand.
  const [manual, setManual] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setManual(false);
  }, []);

  const url = new URL(href, publicOrigins.siteOrigin).toString();
  const links = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  };

  const track = (method: Method) =>
    posthog.capture("share_clicked", { method, section: section ?? null });

  // Escape (back to the trigger) and a press outside close it — the same
  // popover rules as the suggestion box.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  async function onTrigger() {
    // Decided at click time, not render time, so the server HTML and the
    // first client render agree. Desktop browsers that do implement
    // `navigator.share` (Safari, Chrome on macOS) still get the list: their
    // sheet is thin and a reader at a desk mostly wants the link.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!open && touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        track("native");
        return;
      } catch (err) {
        // The reader dismissed the sheet: that's an answer, not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    if (open) close();
    else setOpen(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      track("copy");
    } catch {
      setManual(true);
    }
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        onClick={onTrigger}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex cursor-pointer items-center gap-2 border border-line bg-card px-3 py-2 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:border-accent hover:text-ink",
          open && "border-accent text-ink",
        )}
      >
        <ShareIcon />
        Compartir
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute left-0 top-full z-[35] mt-2 w-[210px] border border-line bg-card py-1 shadow-pop"
      >
        <ul className="m-0 list-none p-0">
          <li>
            <a
              href={links.whatsapp}
              target="_blank"
              rel="noopener"
              onClick={() => {
                track("whatsapp");
                close();
              }}
              className={ITEM}
            >
              <WhatsAppIcon />
              WhatsApp
            </a>
          </li>
          <li>
            <button type="button" onClick={copy} className={ITEM}>
              <LinkIcon />
              {/* Announced when it changes, so a screen reader hears the copy
                  land the same way a sighted reader sees it. */}
              <span aria-live="polite">
                {copied ? "Enlace copiado" : "Copiar enlace"}
              </span>
            </button>
          </li>
          <li>
            <a
              href={links.facebook}
              target="_blank"
              rel="noopener"
              onClick={() => {
                track("facebook");
                close();
              }}
              className={ITEM}
            >
              <FacebookIcon />
              Facebook
            </a>
          </li>
          <li>
            <a
              href={links.x}
              target="_blank"
              rel="noopener"
              onClick={() => {
                track("x");
                close();
              }}
              className={ITEM}
            >
              <XIcon />X
            </a>
          </li>
        </ul>
        {manual && (
          <input
            readOnly
            value={url}
            aria-label="Enlace para copiar"
            // Selected on arrival, so the reader only has to press copy.
            ref={(el) => el?.select()}
            onFocus={(e) => e.currentTarget.select()}
            className="mx-3 mb-2 mt-1 box-border w-[calc(100%-24px)] border border-line bg-paper px-2 py-1.5 font-mono text-[11.5px] text-ink"
          />
        )}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="15"
      height="15"
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

// The three network marks, monochrome in the text colour like the rest of the
// site's glyphs rather than in each brand's colour.

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="mx-px">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}
