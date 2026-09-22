import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const PREVIEW_WIDTH = 960;
const PREVIEW_HEIGHT = 540;

export const COMMERCIAL_MOTIFS = [
  "gastos",
  "impuestos",
  "compra",
  "alquilar",
  "contrato",
  "iva",
  "calcular",
  "contabilidad",
] as const;

export type CommercialMotif = (typeof COMMERCIAL_MOTIFS)[number];

const GROUND = "#f4efe3";
const INK = "#211d16";
const PAPER = "#fdfbf4";
const GREY = "#ddd2bb";
const ACCENT = "#d9480f";
const PALE = "#f7e2d3";

const MOTIFS: Record<CommercialMotif, string> = {
  gastos: `
    <g transform="translate(820 384)">
      <rect x="-92" y="-96" width="184" height="128" rx="18" fill="${PAPER}" stroke="${INK}" stroke-width="12"/>
      <rect x="-72" y="-66" width="106" height="12" rx="6" fill="${GREY}"/>
      <rect x="-72" y="-36" width="144" height="12" rx="6" fill="${PALE}"/>
      <rect x="-72" y="-6" width="84" height="12" rx="6" fill="${GREY}"/>
      <circle cx="48" cy="-2" r="24" fill="${ACCENT}" stroke="${INK}" stroke-width="10"/>
      <path d="M48 -15v27M38 -7c4-10 20-8 20 1 0 11-20 4-20 15 0 9 16 12 20 1" fill="none" stroke="${PAPER}" stroke-width="7" stroke-linecap="round"/>
      <rect x="-62" y="66" width="124" height="20" rx="10" fill="${ACCENT}"/>
    </g>`,
  impuestos: `
    <g transform="translate(820 374) rotate(-8)">
      <rect x="-92" y="-118" width="184" height="236" rx="20" fill="${PAPER}" stroke="${INK}" stroke-width="12"/>
      <rect x="-58" y="-82" width="116" height="14" rx="7" fill="${GREY}"/>
      <rect x="-58" y="-48" width="84" height="14" rx="7" fill="${PALE}"/>
      <circle cx="-38" cy="18" r="17" fill="none" stroke="${INK}" stroke-width="9"/>
      <circle cx="40" cy="78" r="17" fill="none" stroke="${INK}" stroke-width="9"/>
      <line x1="-52" y1="86" x2="54" y2="-44" stroke="${ACCENT}" stroke-width="15" stroke-linecap="round"/>
      <rect x="-58" y="-2" width="44" height="34" rx="12" fill="${ACCENT}"/>
      <rect x="12" y="56" width="56" height="38" rx="12" fill="${PALE}" stroke="${INK}" stroke-width="8"/>
    </g>`,
  compra: `
    <g transform="translate(820 385)">
      <path d="M-112 -58h48l17 124h104l20-84h-138" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="-24" cy="99" r="16" fill="${INK}"/>
      <circle cx="72" cy="99" r="16" fill="${INK}"/>
      <path d="M-28 -106l58 -47m0 0 58 47m-58-47v94" fill="none" stroke="${ACCENT}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="30" cy="-153" r="13" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
    </g>`,
  alquilar: `
    <g transform="translate(820 385)">
      <path d="M-88 72V-38l88-76 88 76V72Z" fill="${PAPER}" stroke="${INK}" stroke-width="13" stroke-linejoin="round"/>
      <rect x="-28" y="-4" width="56" height="76" rx="8" fill="${PALE}" stroke="${INK}" stroke-width="10"/>
      <path d="M-4 -110v-56h56" fill="none" stroke="${ACCENT}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M50 -166v66" fill="none" stroke="${ACCENT}" stroke-width="16" stroke-linecap="round"/>
      <circle cx="50" cy="-166" r="12" fill="${PAPER}" stroke="${INK}" stroke-width="9"/>
    </g>`,
  contrato: `
    <g transform="translate(820 376) rotate(7)">
      <path d="M-92 -126h142l42 42v210H-92Z" fill="${PAPER}" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
      <path d="M50 -126v44h42" fill="${PALE}" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
      <rect x="-56" y="-42" width="94" height="12" rx="6" fill="${GREY}"/>
      <rect x="-56" y="-10" width="122" height="12" rx="6" fill="${GREY}"/>
      <rect x="-56" y="22" width="78" height="12" rx="6" fill="${PALE}"/>
      <path d="M-54 92l86-56 26 30-86 56-34 8Z" fill="${ACCENT}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
    </g>`,
  iva: `
    <g transform="translate(820 380)">
      <rect x="-112" y="-108" width="224" height="206" rx="22" fill="${PAPER}" stroke="${INK}" stroke-width="13"/>
      <rect x="-72" y="-66" width="144" height="14" rx="7" fill="${GREY}"/>
      <circle cx="-44" cy="10" r="18" fill="none" stroke="${INK}" stroke-width="10"/>
      <circle cx="48" cy="64" r="18" fill="none" stroke="${INK}" stroke-width="10"/>
      <line x1="-66" y1="82" x2="72" y2="-70" stroke="${ACCENT}" stroke-width="18" stroke-linecap="round"/>
      <rect x="-76" y="102" width="152" height="15" rx="7" fill="${PALE}"/>
    </g>`,
  calcular: `
    <g transform="translate(820 386) rotate(-12)">
      <path d="M-104 -90h208v180H-104Z" fill="${PAPER}" stroke="${INK}" stroke-width="13"/>
      <rect x="-72" y="-58" width="144" height="36" rx="10" fill="${PALE}" stroke="${INK}" stroke-width="8"/>
      <g fill="${ACCENT}">
        <rect x="-72" y="6" width="28" height="28" rx="6"/><rect x="-22" y="6" width="28" height="28" rx="6"/><rect x="28" y="6" width="44" height="28" rx="6"/>
        <rect x="-72" y="52" width="28" height="28" rx="6"/><rect x="-22" y="52" width="28" height="28" rx="6"/><rect x="28" y="52" width="44" height="28" rx="6"/>
      </g>
      <path d="M-98 -132h196" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
      <path d="M-80 -148v32m40-32v32m40-32v32m40-32v32" stroke="${ACCENT}" stroke-width="9" stroke-linecap="round"/>
    </g>`,
  contabilidad: `
    <g transform="translate(820 380)">
      <rect x="-116" y="-100" width="232" height="190" rx="20" fill="${PAPER}" stroke="${INK}" stroke-width="13"/>
      <path d="M-72 52V-22m48 74v-118m48 118V-58m48 110V-4" stroke="${ACCENT}" stroke-width="22" stroke-linecap="round"/>
      <path d="M-82 -36c32-30 52-14 76-42 30-35 49-10 88-46" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
      <circle cx="82" cy="-124" r="28" fill="${PALE}" stroke="${INK}" stroke-width="10"/>
      <path d="M82 -141v34m-17-17h34" stroke="${ACCENT}" stroke-width="9" stroke-linecap="round"/>
    </g>`,
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapTitle(title: string): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > 22) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function page(title: string, category: string, motif: CommercialMotif): string {
  const safeTitle = escapeHtml(title);
  const safeCategory = escapeHtml(category);
  const titleLines = wrapTitle(safeTitle);
  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<tspan x="544" dy="${index === 0 ? 0 : 34}">${line}</tspan>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
    <rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${GROUND}"/>
    <text x="548" y="112" fill="${ACCENT}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="2">GUÍA · NEGOCIOS</text>
    <text x="544" y="160" fill="${INK}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="-0.5">${titleSvg}</text>
    <rect x="548" y="414" width="224" height="7" rx="4" fill="${ACCENT}"/>
    <text x="548" y="458" fill="${INK}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="1.5">${safeCategory.toUpperCase()}</text>
    <text x="548" y="521" fill="#756b5b" font-family="Arial, Helvetica, sans-serif" font-size="13" letter-spacing="0.4">ARGENTINA · LOCAL COMERCIAL</text>
    <circle cx="886" cy="72" r="22" fill="${PALE}"/>
    <circle cx="914" cy="102" r="9" fill="${ACCENT}"/>
    <g transform="translate(62 74) rotate(-4)">
      <rect x="0" y="0" width="430" height="386" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
      <rect x="31" y="30" width="368" height="52" rx="10" fill="${PALE}"/>
      <text x="52" y="64" fill="${INK}" font-size="17" font-weight="700" letter-spacing="2">LOCAL COMERCIAL</text>
      <path d="M74 290V160l141-112 141 112v130Z" fill="${GROUND}" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
      <path d="M47 160h336" stroke="${ACCENT}" stroke-width="18" stroke-linecap="round"/>
      <path d="M58 160l20 45h47l20-45 20 45h47l20-45 20 45h47l20-45 20 45h47" fill="${PALE}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <rect x="106" y="218" width="86" height="72" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
      <rect x="238" y="218" width="86" height="72" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="10"/>
      <path d="M149 218v72m132-72v72" stroke="${INK}" stroke-width="7"/>
      <rect x="198" y="228" width="38" height="62" rx="7" fill="${ACCENT}" stroke="${INK}" stroke-width="9"/>
      <circle cx="217" cy="258" r="5" fill="${PAPER}"/>
      <path d="M45 322h340" stroke="${GREY}" stroke-width="8" stroke-linecap="round"/>
    </g>
    ${MOTIFS[motif]}
  </svg>`;
}

export async function renderCommercialGuidePreview(
  title: string,
  category: string,
  motif: CommercialMotif,
  out: string,
): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "commercial-guide-preview-"));
  const svg = path.join(dir, "preview.svg");
  writeFileSync(svg, page(title, category, motif));

  const outDir = path.dirname(out);
  if (outDir && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  await sharp(svg)
    .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: "fill" })
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toFile(out);

  const metadata = await sharp(out).metadata();
  if (metadata.width !== PREVIEW_WIDTH || metadata.height !== PREVIEW_HEIGHT) {
    throw new Error(
      `${out} came out ${metadata.width}x${metadata.height}, expected ${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}`,
    );
  }

  return out;
}

export function commercialMotifNames(): readonly CommercialMotif[] {
  return COMMERCIAL_MOTIFS;
}

export function isCommercialMotif(value: string): value is CommercialMotif {
  return (COMMERCIAL_MOTIFS as readonly string[]).includes(value);
}
