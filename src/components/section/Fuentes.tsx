import { Eyebrow } from "@/components/landing/parts";
import { dataLicense } from "@/config/urls";
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

export function Fuentes({
  items,
  license,
}: {
  items: SectionMeta["sources"];
  /** The page's own licence, or the site-wide default. `name` is absent when a
   * page overrides the default with a licence this site can't name. */
  license?: { url: string; name?: string };
}) {
  if (items.length === 0) return null;
  const { url, name } = license ?? dataLicense;

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

      <p className="mt-5 mb-0 font-mono text-[13px] leading-[1.7] text-muted">
        Las tablas y series derivadas de esta página se publican bajo{" "}
        <a
          href={url}
          target="_blank"
          rel="license noopener noreferrer"
          className="text-accent underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
        >
          {name ?? "la licencia de los datos"}
        </a>
        . Los datos originales conservan los términos de cada fuente.
      </p>
    </section>
  );
}
