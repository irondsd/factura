import { Eyebrow } from "@/components/landing/parts";
import type { GuideMeta } from "@/content/guias/guides";
import { FAQ_SECTION } from "@/content/guias/headings";

// The "Preguntas frecuentes" block a guide drops in with a bare <Faq />. Same
// contract as RelatedGuides (see AUTHORING.md §5): the tag takes no props, the
// article route injects `meta.faq` through the MDX `components` prop, so the
// author picks the *placement* and the meta block owns the *content*.
//
// Rendered as a plain <dl> rather than <details> accordions. The questions are
// the reason the block exists — each one targets a search a visitor actually
// typed — and collapsing them hides that text behind a click for no gain, since
// there is no rich result to win by being tidy about it.

export function Faq({ items }: { items: NonNullable<GuideMeta["faq"]> }) {
  if (items.length === 0) return null;

  return (
    // The id is the anchor the table of contents links to — the block is a
    // section of the article like any other, but its heading isn't in the MDX
    // for rehype-slug to have given one. `scroll-mt` matches the body headings.
    <section
      id={FAQ_SECTION.id}
      className="my-12 scroll-mt-24 border-t border-line pt-6"
    >
      <Eyebrow>{FAQ_SECTION.text}</Eyebrow>

      <dl className="mt-5 m-0 flex flex-col gap-6">
        {items.map(({ q, a }) => (
          <div key={q}>
            <dt className="font-display font-semibold text-[17px] sm:text-[18px] leading-[1.3] text-ink">
              {q}
            </dt>
            <dd className="mt-2 ml-0 font-mono text-[14.5px] leading-[1.7] text-ink/90">
              {a}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
