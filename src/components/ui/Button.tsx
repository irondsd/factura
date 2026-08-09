import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

// The one button. Every clickable label in the app is this component — pass
// `href` and it renders a <Link> instead of a <button>, which is what keeps the
// navigating actions (the landing CTA, "manage", "see insights") from drifting
// into hand-rolled copies of these classes. Same bargain as SegmentedControl:
// every variant those cases needed is a prop here, so they can't drift apart
// again.

// The boxed base sets the border *width* only. The colour belongs to each
// variant, including the transparent one — `cn` is a plain join, so two
// utilities for the same property on one element are settled by stylesheet
// order rather than by which was written last, and a `border-transparent` here
// would silently win over any colour a variant or caller adds.
//
// Type is left to BTN_SIZES for exactly that reason: a `text-micro` here beats
// a `text-xs` from the size table no matter which is written last, so the base
// has to stay out of font-size and letter-spacing altogether.
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border font-mono uppercase leading-none cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The base for the variants that aren't a box. `border-none` undoes the border
 * the browser puts on every <button>; a bare variant that wants a rule under
 * its label uses `underline` rather than a border, so it can't collide with
 * this the way two border utilities would.
 *
 * Carries neither type nor padding, for the same reason BTN_BASE carries no
 * type: each bare variant sets its own, and a value here would shadow it.
 */
const BARE_BASE =
  "inline-flex items-center justify-center gap-1.5 bg-transparent border-none font-mono cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Each step owns its own type as well as its padding — see BTN_BASE. */
const BTN_SIZES = {
  sm: "py-1.5 px-2.5 text-micro tracking-label",
  md: "py-2 px-3 text-micro tracking-label",
  lg: "py-2.5 px-4 text-xs tracking-label",
  // The marketing register: the one thing a landing, FAQ or guide page wants
  // clicked, sized to be found rather than to fit its label. Tracking loosens
  // more slowly than the type, or a wide label starts to come apart.
  xl: "py-3 px-[26px] text-[13px] tracking-[0.12em]",
} as const;

export type ButtonSize = keyof typeof BTN_SIZES;

const BTN_VARIANTS = {
  // Fills with the accent on hover — the same move `danger` makes. A primary
  // action with no hover state at all reads as one that isn't listening.
  solid: "bg-ink text-paper border-ink hover:bg-accent hover:border-accent",
  // `solid` with the two fills swapped: accent at rest, ink on hover. For the
  // one CTA on a page that has to be found before it's read — inside a bordered
  // block, where an ink fill is just another dark rectangle. Everywhere a
  // primary action sits on open page, `solid` is still the one.
  accent: "bg-accent text-paper border-accent hover:bg-ink hover:border-ink",
  outline:
    "bg-transparent text-ink border-line hover:border-accent hover:text-accent",
  // `solid`'s outlined twin: a full-strength ink rule rather than the hairline
  // `outline` wears, filling with ink on hover. Reads as a second CTA beside a
  // solid one, which is more weight than `outline` can carry on a wide page.
  invert:
    "bg-transparent text-ink border-ink hover:bg-ink hover:text-paper hover:border-ink",
  ghost: "bg-transparent text-muted border-transparent hover:text-accent",
  // Wears the accent at rest and fills with it on hover.
  danger:
    "bg-transparent text-accent border-accent hover:bg-accent hover:text-paper",

  // ── bare ──────────────────────────────────────────────────────────────────
  // A label with no box: "other ways to sign in", "back", "dismiss". Keeps the
  // mono uppercase micro type so it still reads as an action and not as copy.
  quiet:
    "p-0 text-micro uppercase tracking-label leading-none text-muted hover:text-accent",
  // A low-key text action — "view the text", "report this", "try a sample" —
  // either standing in a row of its own or sitting inside a sentence, where an
  // uppercase label would break the line's rhythm. Borrows a link's dotted rule
  // instead of a box, and stays at one size rather than inheriting, so the two
  // placements don't drift half a pixel apart.
  link: "p-0 text-xs text-accent underline decoration-dotted underline-offset-4 hover:text-ink hover:decoration-ink",
  // A single glyph: the ✕ that closes a dialog, drawer, toast or row. Scale and
  // tap target come from ICON_SIZES rather than from here, because the ✕ on a
  // dialog and the ✕ on a builder row are the same control at two densities.
  icon: "leading-none text-muted hover:text-accent",
} as const;

export type ButtonVariant = keyof typeof BTN_VARIANTS;

/**
 * `size` for the glyph variant. Type and padding move together: a bigger ✕ is a
 * bigger target, not a bigger glyph in the same box.
 *
 * This is a separate table because the boxed sizes are padding-only, and a
 * caller can't fix the mismatch from `className` — two font-size utilities on
 * one element are settled by stylesheet order, not by which was written last.
 */
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "p-0.5 text-xs",
  md: "p-1 text-base",
  lg: "p-1.5 text-lg",
  xl: "p-2 text-xl",
};

function buttonClass(variant: ButtonVariant, size: ButtonSize): string {
  if (variant === "icon")
    return cn(BARE_BASE, ICON_SIZES[size], BTN_VARIANTS.icon);
  // `quiet` and `link` set their own type, so `size` has nothing to say.
  if (variant === "quiet" || variant === "link")
    return cn(BARE_BASE, BTN_VARIANTS[variant]);
  return cn(BTN_BASE, BTN_SIZES[size], BTN_VARIANTS[variant]);
}

type Common = {
  variant?: ButtonVariant;
  /** Ignored by the bare variants (`quiet`, `link`, `icon`) — see BARE_BASE. */
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
  /**
   * A disabled Button is always a real `<button disabled>`, even when an `href`
   * was passed: the platform has no disabled link, and an <a> stripped of its
   * href still sits in the tab order announcing itself as one.
   */
  disabled?: boolean;
};

export type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common> & {
    href?: undefined;
  };

export type ButtonLinkProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & {
    /** Renders a `next/link` instead of a `<button>`. Absolute URLs and
     * `target="_blank"` pass straight through. */
    href: string;
  };

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  disabled,
  ...rest
}: ButtonProps | ButtonLinkProps) {
  const cls = cn(buttonClass(variant, size), className);

  if (rest.href !== undefined && !disabled) {
    const { href, ...anchor } = rest;
    return (
      <Link href={href} className={cls} {...anchor}>
        {children}
      </Link>
    );
  }

  const { href, ...button } = rest as {
    href?: string;
  } & ButtonHTMLAttributes<HTMLButtonElement>;
  void href;
  return (
    <button {...button} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
