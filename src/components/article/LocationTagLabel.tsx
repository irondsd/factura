/** The location tag, everywhere one is drawn: a faded hash and naked caps, no
 * box and no border.
 *
 * Both spans take `text-current` rather than a colour of their own, so the tag
 * inherits whatever the surrounding link is doing and the hash shifts with the
 * name on hover instead of staying behind. That makes the hover state the
 * link's business — a caller pairs this with `text-ink transition-colors
 * hover:text-accent` — which is what keeps the article footer and the
 * /ubicacion directory from drifting apart.
 *
 * The hash is `aria-hidden`: it is a visual marker for "this is a place tag",
 * and a screen reader announcing "pound Buenos Aires" is noise. */
export function LocationTagLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        aria-hidden="true"
        className="pointer-events-none font-mono text-[13px] font-semibold text-current opacity-45 select-none"
      >
        #
      </span>
      <span className="font-mono text-[12.5px] font-medium tracking-[0.1em] text-current uppercase">
        {label}
      </span>
    </span>
  );
}
