import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { loadStatsPage, statsSlugs } from "@/content/estadisticas/pages";

// The social card for a statistics page — the same picture, and the same
// reasoning, as the guides' card at /og/guias/[slug]/card.png: an explicit route
// rather than the `opengraph-image` file convention, because the URL has to be
// knowable (og:image, twitter:image and the Article JSON-LD all name it), free
// of the /es prefix the proxy would otherwise 308, and served past the proxy —
// which the `.png` at the end of the path takes care of.
//
// The card lives at /og/estadisticas/<path>/card.png, matching the guides'
// shape — but a page's path has a variable number of segments, and Next requires
// a catch-all to be the LAST part of a route. So "card.png" is not a route
// segment here: it's the final element of the catch-all, appended by
// `generateStaticParams` and popped back off below. `statsCardUrl` in
// i18n/metadata.ts builds the matching URL.
//
// Prerendered at build (`force-static` + `generateStaticParams`), so no image is
// ever rendered at runtime and the font files are only read by the build.

export const dynamic = "force-static";
export const dynamicParams = false;

const CARD = "card.png";

export function generateStaticParams() {
  return statsSlugs().map((slug) => ({ slug: [...slug, CARD] }));
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  if (slug[slug.length - 1] !== CARD) {
    return new Response("Not found", { status: 404 });
  }
  const page = await loadStatsPage(slug.slice(0, -1));
  if (!page) return new Response("Not found", { status: 404 });
  const { meta } = page;

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
        ESTADÍSTICAS
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
        {meta.ogStat !== undefined && (
          <div
            style={{
              marginTop: 32,
              fontFamily: "IBM Plex Mono",
              fontSize: 36,
              color: ACCENT,
              display: "flex",
            }}
          >
            {meta.ogStat}
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
        <div
          style={{ fontFamily: "IBM Plex Mono", fontSize: 23, color: MUTED }}
        >
          factura.uno/estadisticas
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
