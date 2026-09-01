import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ContentSection } from "@/content/section";

// The social card for a page of /estadisticas or /investigaciones — the same
// picture, and the same reasoning, as the guides' card at
// /og/guias/[slug]/card.png: an explicit route rather than the
// `opengraph-image` file convention, because the URL has to be knowable
// (og:image, twitter:image and the Article JSON-LD all name it), free of the
// /es prefix the proxy would otherwise 308, and served past the proxy — which
// the `.png` at the end of the path takes care of.
//
// The card lives at /og/<section>/<path>/card.png, matching the guides'
// shape — but a page's path has a variable number of segments, and Next requires
// a catch-all to be the LAST part of a route. So "card.png" is not a route
// segment here: it's the final element of the catch-all, appended by
// `generateStaticParams` and popped back off below. `sectionCardUrl` in
// i18n/metadata.ts builds the matching URL.
//
// Every route that uses this is `force-static` + `generateStaticParams`, so the
// pages that exist at build time get their card prerendered and the fonts below
// are read by the build.
//
// `dynamicParams` must stay TRUE on all of them, though, and that is not a
// detail. Publishing through the CMS has no build step (cms.md, "Caching"), so a
// page published after the last deploy is never in `generateStaticParams` —
// and with `dynamicParams = false` its card 404s until someone happens to
// redeploy, which is how the first /noticias article shipped with a broken
// og:image. True means that card is rendered on demand the first time it is
// requested and then cached. Nothing unbounded gets through: `sectionCard`
// below 404s for a path that does not end in card.png, and again for a slug the
// section cannot load, so only real published pages ever reach the renderer.

export const CARD = "card.png";

/** The slugs the `/og/<section>/[...slug]` route prerenders: every page's path
 * with "card.png" appended. */
export async function cardParams(
  section: ContentSection,
): Promise<{ slug: string[] }[]> {
  return (await section.slugs()).map((slug) => ({ slug: [...slug, CARD] }));
}

const SIZE = { width: 1200, height: 630 };

// The paper palette, copied from globals.css. Duplicated deliberately: satori
// resolves no CSS variables, and a stylesheet import here would drag the whole
// Tailwind layer into an image route.
const PAPER = "#f4efe3";
const INK = "#211d16";
const MUTED = "#857b67";
const LINE = "#ddd2bb";
const ACCENT = "#d9480f";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const loadFont = (file: string) => readFile(path.join(FONT_DIR, file));

/** Headline size, stepped down as the title gets longer so three lines is the
 * worst case. Satori has no line clamp; these steps are what keep a long title
 * inside the card. */
function headlineSize(title: string): number {
  if (title.length <= 34) return 76;
  if (title.length <= 48) return 66;
  return 58;
}

/** Render one page's card, or a 404 for a path that isn't one. The whole body
 * of both sections' `/og/…/route.tsx`. */
export async function sectionCard(
  section: ContentSection,
  slug: string[],
): Promise<Response> {
  if (slug[slug.length - 1] !== CARD) {
    return new Response("Not found", { status: 404 });
  }
  const page = await section.load(slug.slice(0, -1));
  if (!page) return new Response("Not found", { status: 404 });
  const { meta } = page;
  const eyebrow = meta.ogImage?.eyebrow ?? section.label;
  const stat = meta.ogImage?.stat ?? meta.ogStat;

  const [fraunces, plexMono] = await Promise.all([
    loadFont("Fraunces-SemiBold.ttf"),
    loadFont("IBMPlexMono-Medium.ttf"),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: PAPER,
        color: INK,
        padding: "68px 76px",
        fontFamily: "Fraunces",
      }}
    >
      <div
        style={{
          fontFamily: "IBM Plex Mono",
          fontSize: 25,
          letterSpacing: "0.16em",
          color: ACCENT,
        }}
      >
        {eyebrow.toUpperCase()}
      </div>

      {/* Grows to fill whatever the headline doesn't, and hangs its contents
          from the bottom — so a one-line title and a three-line one both sit on
          the rule instead of floating at different heights. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          paddingBottom: 44,
        }}
      >
        <div
          style={{
            fontSize: headlineSize(meta.title),
            lineHeight: 1.12,
            letterSpacing: "-0.025em",
            display: "flex",
          }}
        >
          {meta.title}
        </div>
        {/* Mono, like every other figure on the site — and not optional here:
            satori draws Fraunces' "+" with a broken advance, so "+318%" collides
            with its own digits in the display face. */}
        {stat !== undefined && (
          <div
            style={{
              marginTop: 32,
              fontFamily: "IBM Plex Mono",
              fontSize: 36,
              color: ACCENT,
              display: "flex",
            }}
          >
            {stat}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderTop: `2px solid ${LINE}`,
          paddingTop: 28,
        }}
      >
        {/* The wordmark, built the way the site builds it: the dot is a separate
            mark in the accent, not a period in the text. */}
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div style={{ fontSize: 40, letterSpacing: "-0.02em" }}>Factura</div>
          <div
            style={{
              width: 11,
              height: 11,
              marginLeft: 5,
              marginBottom: 9,
              borderRadius: 999,
              backgroundColor: ACCENT,
            }}
          />
        </div>
        {/* One expression, not `factura.uno{section.base}`: satori refuses a
            <div> with more than one child unless it declares a display mode,
            and two adjacent JSX children is exactly that. */}
        <div
          style={{ fontFamily: "IBM Plex Mono", fontSize: 23, color: MUTED }}
        >
          {`factura.uno${section.base}`}
        </div>
      </div>
    </div>,
    {
      ...SIZE,
      fonts: [
        { name: "Fraunces", data: fraunces, style: "normal", weight: 600 },
        { name: "IBM Plex Mono", data: plexMono, style: "normal", weight: 500 },
      ],
    },
  );
}
