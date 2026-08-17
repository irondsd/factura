import { Eyebrow } from "@/components/landing/parts";
import { SOURCES_SECTION } from "@/content/headings";
import type { SectionMeta } from "@/content/section";

// The sources block a page drops in with a bare <Fuentes />. Same
// contract as <Faq />: the tag takes no props, the route injects `meta.sources`
// through the MDX `components` prop, so the author picks the *placement* and the
// meta block owns the *content*.
//
// One list, two consumers: this block and the `Dataset` structured data, which
// names the same organisations as the dataset's `creator`. A page that showed a
// source it didn't declare — or declared one it didn't show — would be exactly
// the kind of markup/page mismatch the guides' FAQ is careful to avoid.

export function Fuentes({ items }: { items: SectionMeta["sources"] }) {
  if (items.length === 0) return null;

  return (
    <section
      id={SOURCES_SECTION.id}
      className="my-12 scroll-mt-24 border-t border-line pt-6"
    >
      <Eyebrow>{SOURCES_SECTION.text}</Eyebrow>

      <ul className="mt-5 m-0 flex list-none flex-col gap-3 p-0">
        {items.map(({ label, href, note }) => (
          <li key={href} className="font-mono text-[14.5px] leading-[1.7]">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
            >
              {label}
            </a>
            {note && <span className="text-muted"> — {note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
