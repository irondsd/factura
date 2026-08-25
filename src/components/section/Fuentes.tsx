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
//
// The licence line follows the same rule. `Dataset.license` says these tables
// may be reused; a reader who has to read the JSON-LD to find that out is being
// told something the page itself never says, so the line is printed here, from
// the same value the markup emits.
//
// It is also the one part that does not travel to a guide. A guide cites the
// distributor's own documentation and a couple of resolutions; it publishes no
// table of its own, so "las tablas y series derivadas de esta página" would be
// describing something that isn't there. The data routes pass a licence, the
// guide route passes none, and the paragraph follows the prop.

export function Fuentes({
  items,
  license,
}: {
  items: SectionMeta["sources"];
  /** The page's own licence, or the site-wide default. `name` is absent when a
   * page overrides the default with a licence this site can't name. Omitted
   * entirely by pages that publish no data of their own — the licence
   * paragraph is then left off rather than defaulted. */
  license?: { url: string; name?: string };
}) {
  if (!items || items.length === 0) return null;

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

      {license && (
        <p className="mt-5 mb-0 font-mono text-[13px] leading-[1.7] text-muted">
          Las tablas y series derivadas de esta página se publican bajo{" "}
          <a
            href={license.url}
            target="_blank"
            rel="license noopener noreferrer"
            className="text-accent underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
          >
            {license.name ?? "la licencia de los datos"}
          </a>
          . Los datos originales conservan los términos de cada fuente.
        </p>
      )}
    </section>
  );
}
