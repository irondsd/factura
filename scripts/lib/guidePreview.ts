/**
 * The bill-photo preview template: palette, motifs, cropping and rendering.
 *
 * Preview images on this site come in two families. The older one is a
 * hand-drawn SVG illustration with no photograph in it — a stylised bill plus a
 * service object (tap, burner, meter). This module is the second family, for
 * the vendor guides that already carry a picture of the bill they explain:
 * instead of drawing a bill, it puts the real one in the card.
 *
 * The two families share a palette and a stroke weight on purpose, so a
 * listing that mixes them still reads as one set.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

/** Every preview is exactly this size. The listing thumbnail is 160px wide, so
 * 960×540 covers it at well over 2×, and 16:9 is what the article header and
 * the row both expect. */
export const PREVIEW_WIDTH = 960;
export const PREVIEW_HEIGHT = 540;

/** The palette, shared with the hand-drawn previews. These are the only place
 * the hex literals live — nothing in `src/` knows about them, because previews
 * are images rather than markup. */
const GROUND = "#f4efe3";
const INK = "#211d16";
const PAPER = "#fdfbf4";
const GREY = "#ddd2bb";
const ACCENT = "#d9480f";
const PALE = "#f7e2d3";

/**
 * The motif is the object beside the bill, and it carries the **action** rather
 * than the service.
 *
 * That is the one deliberate difference from the hand-drawn family, where the
 * motif is a tap or a burner. Here the card already holds the vendor's own
 * branding, so the vendor is never in question — what a reader cannot tell
 * apart at thumbnail size is "cómo leer la factura de X" from "cómo pagar la
 * factura de X", which sit next to each other in every listing and would
 * otherwise be the same picture twice.
 *
 * Keep the accent (`ACCENT`) on exactly one element per preview, and keep it an
 * *instrument*: never let a motif resolve into an up-arrow silhouette, which
 * belongs to the "cuánto aumentó" guides.
 */
export const MOTIFS = {
  /** "Cómo leer" — a magnifier, its lens holding the one line you were after. */
  leer: `
    <g transform="translate(742 258)">
      <circle cx="0" cy="0" r="104" fill="${PAPER}" stroke="${INK}" stroke-width="18"/>
      <rect x="-58" y="-34" width="116" height="14" rx="7" fill="${GREY}"/>
      <rect x="-58" y="-6" width="80" height="14" rx="7" fill="${PALE}"/>
      <rect x="-58" y="22" width="116" height="20" rx="10" fill="${ACCENT}"/>
      <line x1="74" y1="74" x2="132" y2="132" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
    </g>`,

  /** "Cómo pagar" — the bill settled from a phone; the accent is the pay button. */
  pagar: `
    <g transform="translate(742 258)">
      <rect x="-84" y="-140" width="168" height="280" rx="26" fill="${PAPER}" stroke="${INK}" stroke-width="14"/>
      <rect x="-26" y="-118" width="52" height="10" rx="5" fill="${INK}"/>
      <rect x="-54" y="-78" width="108" height="12" rx="6" fill="${GREY}"/>
      <rect x="-54" y="-50" width="76" height="12" rx="6" fill="${GREY}"/>
      <rect x="-54" y="-8" width="108" height="18" rx="9" fill="${PALE}"/>
      <rect x="-54" y="52" width="108" height="44" rx="14" fill="${ACCENT}"/>
      <path d="M-26 74 l16 16 l30 -32" fill="none" stroke="${PAPER}" stroke-width="12"
            stroke-linecap="round" stroke-linejoin="round"/>
    </g>`,

  /** Tarifa social, subsidios, descuentos — a discount tag on the bill. */
  tarifa: `
    <g transform="translate(752 258) rotate(-14)">
      <path d="M-128 0 L-58 -82 L104 -82 a26 26 0 0 1 26 26 L130 56 a26 26 0 0 1 -26 26
               L-58 82 Z"
            fill="${ACCENT}" stroke="${INK}" stroke-width="14"/>
      <circle cx="-62" cy="0" r="17" fill="${GROUND}" stroke="${INK}" stroke-width="12"/>
      <g transform="translate(38 0)">
        <line x1="-34" y1="34" x2="34" y2="-34" stroke="${PALE}" stroke-width="15" stroke-linecap="round"/>
        <circle cx="-28" cy="-28" r="14" fill="none" stroke="${PALE}" stroke-width="14"/>
        <circle cx="28" cy="28" r="14" fill="none" stroke="${PALE}" stroke-width="14"/>
      </g>
    </g>`,
} as const;

export type Motif = keyof typeof MOTIFS;

export const MOTIF_NAMES = Object.keys(MOTIFS) as Motif[];

export function isMotif(value: string): value is Motif {
  return value in MOTIFS;
}

/** The page, assembled around a bill already cropped to 3:2.
 *
 * The card's `-4°` tilt, its 5px ink border and the shadow are the grammar the
 * hand-drawn previews use; only the contents of the card differ. */
function page(billDataUri: string, motif: Motif): string {
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  body{width:${PREVIEW_WIDTH}px;height:${PREVIEW_HEIGHT}px;background:${GROUND};overflow:hidden}
  .card{position:absolute;left:56px;top:104px;width:508px;height:339px;
        transform:rotate(-4deg);background:${PAPER};
        border:5px solid ${INK};box-sizing:border-box;
        filter:drop-shadow(0 12px 14px rgba(33,29,22,.14))}
  .card img{display:block;width:100%;height:100%;object-fit:cover;object-position:top left}
  svg{position:absolute;inset:0}
  </style>
  <div class="card"><img src="${billDataUri}"></div>
  <svg width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}"
       viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">${MOTIFS[motif]}</svg>`;
}

/** Fails with the actual remediation rather than a spawn error. */
function requireBinary(name: string, hint: string): void {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
  } catch {
    throw new Error(`\`${name}\` not found on PATH. ${hint}`);
  }
}

/**
 * Locates Playwright's `chrome-headless-shell`.
 *
 * **Not** the `Google Chrome.app` binary: modern Chrome hangs indefinitely when
 * driven with `--headless --screenshot`, with no output and no error, so the
 * whole render just stalls until something kills it. The headless shell is a
 * separate build that still honours the old one-shot screenshot flags.
 *
 * Playwright installs it per browser revision, so the directory name carries a
 * build number that moves with every upgrade — hence the scan for the newest
 * one instead of a pinned path. `CHROME_HEADLESS_SHELL` overrides everything if
 * you have the binary somewhere else.
 */
export function findHeadlessShell(): string {
  const override = process.env.CHROME_HEADLESS_SHELL;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(
        `CHROME_HEADLESS_SHELL is set but ${override} does not exist.`,
      );
    }
    return override;
  }

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(homedir(), "Library/Caches/ms-playwright"), // macOS
    path.join(homedir(), ".cache/ms-playwright"), // Linux
  ].filter((dir): dir is string => Boolean(dir) && existsSync(dir!));

  const found: { build: number; binary: string }[] = [];
  for (const root of roots) {
    for (const entry of readdirSync(root)) {
      const match = /^chromium_headless_shell-(\d+)$/.exec(entry);
      if (!match) continue;
      const platformDir = path.join(root, entry);
      for (const platform of readdirSync(platformDir)) {
        const binary = path.join(
          platformDir,
          platform,
          "chrome-headless-shell",
        );
        if (existsSync(binary)) found.push({ build: Number(match[1]), binary });
      }
    }
  }

  if (found.length === 0) {
    throw new Error(
      "chrome-headless-shell not found. Install it with " +
        "`bunx playwright install chromium-headless-shell`, or point " +
        "CHROME_HEADLESS_SHELL at an existing binary.",
    );
  }
  found.sort((a, b) => b.build - a.build);
  return found[0]!.binary;
}

/**
 * Crops a bill down to a 3:2 band anchored at the **top** of the page.
 *
 * One rule covers every source because of where bills put their identity: the
 * logo, the account number and the total sit in the top band whatever the
 * page's own aspect ratio, so a portrait scan, a landscape crop and a
 * photographed page all survive the same treatment. Anchoring to the top also
 * means the part that identifies the vendor is the part that stays legible at
 * thumbnail size.
 *
 * `inset` is a percentage trimmed off all four sides, for the samples that were
 * photographed on a desk rather than scanned flat — without it the card frames
 * a strip of wood. 5–6 is about right for a page shot on a table; 0 for a scan.
 */
export function cropBill(src: string, dst: string, inset = 0): void {
  const [width, height] = execFileSync("magick", [
    "identify",
    "-format",
    "%w %h",
    src,
  ])
    .toString()
    .split(" ")
    .map(Number) as [number, number];

  const insetX = Math.round((width * inset) / 100);
  const insetY = Math.round((height * inset) / 100);
  const innerWidth = width - 2 * insetX;
  const innerHeight = height - 2 * insetY;

  // Wider than 3:2 already: keep the full height and trim the right-hand side,
  // which keeps the left-aligned logo. Otherwise keep the full width and cut
  // the bottom off.
  const [cropWidth, cropHeight] =
    innerWidth * 2 >= innerHeight * 3
      ? [Math.round(innerHeight * 1.5), innerHeight]
      : [innerWidth, Math.round(innerWidth / 1.5)];

  execFileSync("magick", [
    src,
    "-crop",
    `${cropWidth}x${cropHeight}+${insetX}+${insetY}`,
    "+repage",
    "-resize",
    "1200x800!",
    "-quality",
    "92",
    dst,
  ]);
}

/** Renders one preview and returns the path it wrote.
 *
 * The screenshot is taken at 2× and downsampled with Lanczos rather than
 * rendered at 960×540 directly — text on a photographed bill falls apart under
 * a 1× rasteriser, and the downsample is what keeps the ink strokes clean. */
export function renderPreview(
  croppedBill: string,
  motif: Motif,
  out: string,
  shell = findHeadlessShell(),
): string {
  const uri = `data:image/jpeg;base64,${readFileSync(croppedBill).toString("base64")}`;
  const dir = mkdtempSync(path.join(tmpdir(), "guide-preview-"));
  const html = path.join(dir, "preview.html");
  const shot = path.join(dir, "shot.png");
  writeFileSync(html, page(uri, motif));

  execFileSync(
    shell,
    [
      "--disable-gpu",
      "--hide-scrollbars",
      "--virtual-time-budget=4000",
      "--force-device-scale-factor=2",
      `--window-size=${PREVIEW_WIDTH},${PREVIEW_HEIGHT}`,
      `--screenshot=${shot}`,
      `--user-data-dir=${path.join(dir, "profile")}`,
      `file://${html}`,
    ],
    { stdio: "ignore" },
  );

  execFileSync("magick", [
    shot,
    "-filter",
    "Lanczos",
    "-resize",
    `${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}`,
    "-strip",
    "-quality",
    "82",
    out,
  ]);

  const size = execFileSync("magick", [
    "identify",
    "-format",
    "%wx%h",
    out,
  ]).toString();
  if (size !== `${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}`) {
    throw new Error(
      `${out} came out ${size}, expected ${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}`,
    );
  }
  return out;
}

/** Crop and render in one step, through a temporary crop. */
export function buildPreview(
  bill: string,
  motif: Motif,
  out: string,
  inset = 0,
  shell = findHeadlessShell(),
): string {
  requireBinary("magick", "Install ImageMagick: `brew install imagemagick`.");
  const dir = mkdtempSync(path.join(tmpdir(), "guide-preview-crop-"));
  const cropped = path.join(dir, "bill.jpg");
  cropBill(bill, cropped, inset);
  return renderPreview(cropped, motif, out, shell);
}
