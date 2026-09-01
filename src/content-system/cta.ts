// The copy and the length advisory behind a page's `<TopCta />` line.
//
// Three modules need to agree about that one field and none of them owns the
// other two: the component renders it, the CMS form writes it, and the document
// validator warns about it. The constants live here so a change to the default
// sentence is one edit rather than three that drift.

/** The `<TopCta />` line for a page that doesn't write its own.
 *
 * `cta` used to be required, which meant every page — including the ones whose
 * subject gives the offer no particular hook — invented a sentence for the
 * banner. A page-specific line is still the better one and the field is still
 * there to write it; this is what the banner says when there is nothing more
 * pointed to say, rather than a blank strip above the article. */
export const DEFAULT_TOP_CTA =
  "Automatizá tus facturas. Visualizá gratis tus gastos y el impacto de la inflación en un clic.";

/** How long a custom line can get before it is worth shortening.
 *
 * Advisory, never enforced: the banner lays out fine past this, it just stops
 * being the one-glance hook it is placed as — the button drifts down the block
 * and a reader who came for the article reads three lines of offer first. The
 * default above sits at 93, deliberately inside the limit. */
export const TOP_CTA_MAX_CHARS = 110;
