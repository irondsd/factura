// The page summary: two or three sentences, set on a tinted block, that answer
// the question the page is about before the article starts arguing it.
//
//   <Resumen>
//
//   ¿Cuánto cuesta un m² de terreno en la Provincia de Buenos Aires? …
//
//   </Resumen>
//
// ── Why it is a body component and not a metadata field ───────────────────
// `summary` and `description` already exist, and neither can do this job: they
// are one sentence each, written for an index card and a search snippet, and
// the route places them where it decides. This is the *reader's* summary — long
// enough to carry the answer and the caveat, written for the person who landed
// on the page and wants to know in ten seconds whether it is the page they
// needed. That makes it part of the body, so the author owns both the wording
// and where it sits: after the intro paragraph on a guide, above the first
// figure on a data page.
//
// ── Why a tint and no rule inside it ──────────────────────────────────────
// The block has to read as "the article, highlighted" rather than as furniture
// dropped into it — a card, a quote or a callout all say *aside*, and this is
// the opposite of an aside. So: the article's own type at the article's own
// size, on paper one step deeper than the page, inside a hairline that closes
// the shape without weighing it. Nothing is bolded, nothing is an icon, and
// there is no label; a summary that needs a heading saying "resumen" is one the
// reader would have skipped anyway.

/** The page summary block an author writes around a paragraph of prose. */
export function Resumen({ children }: { children?: React.ReactNode }) {
  // An empty tag reaches here as `undefined` from MDX and as an empty string
  // from a hand-written `<Resumen></Resumen>`. Either way the honest render is
  // nothing: a tinted rectangle with no sentence in it is worse on the page
  // than the missing block, and the author gets told by the validator, not by
  // a box.
  if (
    children == null ||
    children === false ||
    (typeof children === "string" && children.trim() === "")
  ) {
    return null;
  }

  return (
    // `aside` with a name: the block is the page's own summary, so a reader on
    // a screen reader should be able to find it as a landmark and skip it once
    // they have heard it. The sections that render this are Spanish-only (see
    // the note in `components/guides/cta.tsx`), so the label is inline Spanish.
    <aside aria-label="Resumen" className="my-7 bg-paper-tint px-6 py-[22px]">
      {/* A div, not a p: MDX wraps the child prose in its own <p>, and a <p>
          inside a <p> is invalid HTML that React reports as a hydration
          failure. The child selectors give that wrapper the block's type —
          the article's size and family, at full ink rather than the body's
          90%, which is the whole of the emphasis here — and collapse the
          margins the markdown map would otherwise add inside the padding. */}
      <div className="font-mono text-[15px] leading-[26px] text-ink text-pretty [&>p]:my-0 [&>p]:font-mono [&>p]:text-[15px] [&>p]:leading-[26px] [&>p]:text-ink [&>p+p]:mt-4">
        {children}
      </div>
    </aside>
  );
}
