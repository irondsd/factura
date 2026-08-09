import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getCategory } from "@/content/guias/categories";
import { guideSlugs, loadGuide } from "@/content/guias/guides";

// The social card for a guide — the image WhatsApp, X, Slack and LinkedIn show
// when someone shares the article. Every guide had been sharing the one static
// brand card; this gives each of them its own headline.
//
// Why an explicit route instead of the `opengraph-image.tsx` file convention:
//
//  1. The URL is knowable. The file convention mints a content-hashed URL that
//     nothing can reference, and this card has three consumers — `og:image`,
//     `twitter:image` and the Article JSON-LD `image`. One predictable URL is
//     what lets all three name the same picture.
//  2. No /es/ in the markup. The guides live under `(site)/[lang]`, so the file
//     convention would emit `…/es/guias/<slug>/opengraph-image`, which the proxy
//     308s to the bare path. An og:image that redirects is a smell, and the /es
//     URLs are exactly what the proxy exists to keep out of the markup.
//  3. `.png` in the path keeps the proxy off it: the matcher skips anything with
//     a file extension, so this is served directly.
//
// Prerendered at build (`force-static` + `generateStaticParams`), so there is no
// runtime image rendering and the font files below are only ever read by the
// build.

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
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
 * worst case. Guide titles are capped at 60 characters by the validator, and
 * the longest of them sets the smallest step. */
function headlineSize(title: string): number {
  if (title.length <= 34) return 76;
  if (title.length <= 48) return 66;
  return 58;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { meta } = await loadGuide(slug);

  const [fraunces, plexMono] = await Promise.all([
    loadFont("Fraunces-SemiBold.ttf"),
    loadFont("IBMPlexMono-Medium.ttf"),
  ]);

  // "GUÍA · EDESUR" — the vendor when the guide is about one specific bill,
  // otherwise its primary category. An author can override the whole line.
  const category = getCategory(meta.categories[0]);
  const eyebrow = (
    meta.ogImage?.eyebrow ?? `Guía · ${meta.vendor ?? category?.label ?? ""}`
  )
    .trim()
    .toUpperCase();

  return new ImageResponse(
    (
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
          {eyebrow}
        </div>

        {/* Grows to fill whatever the headline doesn't, and hangs its contents
            from the bottom — so a one-line title and a three-line one both sit
            on the rule instead of floating at different heights. */}
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
              // Satori has no line clamp; the size steps above are what keep a
              // 60-character title inside the card.
              display: "flex",
            }}
          >
            {meta.title}
          </div>
          {/* The stat is mono, like every other figure on the site — and not
              optional here: satori draws Fraunces' "+" with a broken advance,
              so "+318%" collides with its own digits in the display face. */}
          {meta.ogImage?.stat !== undefined && (
            <div
              style={{
                marginTop: 32,
                fontFamily: "IBM Plex Mono",
                fontSize: 40,
                color: ACCENT,
                display: "flex",
              }}
            >
              {meta.ogImage.stat}
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
          {/* The wordmark, built the way the site builds it: the dot is a
              separate mark in the accent, not a period in the text. */}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div style={{ fontSize: 40, letterSpacing: "-0.02em" }}>
              Factura
            </div>
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
            style={{
              fontFamily: "IBM Plex Mono",
              fontSize: 23,
              color: MUTED,
            }}
          >
            factura.uno/guias
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: "Fraunces", data: fraunces, style: "normal", weight: 600 },
        { name: "IBM Plex Mono", data: plexMono, style: "normal", weight: 500 },
      ],
    },
  );
}
