// What may be uploaded, and how much of it. Pure: no S3, no sharp, no database,
// so every rule here is testable without any of them.
//
// The governing principle (cms.md) is that nothing trusts the
// browser. The filename extension and the `Content-Type` the client claims are
// both hints used to fail *early* and cheaply; the answer that counts comes
// from the bytes, and is taken again at finalization.

/** The formats the first release delivers (cms.md).
 *
 * SVG is deliberately absent. It can carry scripts, external references and
 * other active content, Next.js recommends special CSP/attachment handling
 * before enabling it, and a vector file gains nothing from raster optimization.
 * It becomes possible later with a real sanitizer, a restrictive CSP,
 * `unoptimized` and its own tests — not by adding a line here.
 *
 * TIFF/BMP/HEIC are import formats rather than delivery formats. A later
 * ingestion step may decode and convert them into one of these without changing
 * anything else in this model. */
export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const isSupportedMimeType = (
  value: string,
): value is SupportedMimeType =>
  (SUPPORTED_MIME_TYPES as readonly string[]).includes(value);

/** The canonical extension for a stored master. One extension per format, so a
 * key is derivable and a `.jpeg`/`.jpg` mix never happens. */
export const EXTENSION_FOR: Record<SupportedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** Human-readable format names for the library UI. */
export const FORMAT_LABEL: Record<SupportedMimeType, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
  "image/gif": "GIF",
};

/** Guardrails, configuration-backed with the defaults from cms.md */
function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_UPLOAD_BYTES = numberFromEnv(
  "CMS_MEDIA_MAX_BYTES",
  20 * 1024 * 1024,
);
export const MAX_BATCH_FILES = numberFromEnv("CMS_MEDIA_MAX_BATCH", 20);
/** After orientation is applied. A "dimension bomb" is a small file that
 * decodes into an enormous surface, so this is checked on the decoded result
 * rather than on the byte size. */
export const MAX_MEGAPIXELS = numberFromEnv("CMS_MEDIA_MAX_MEGAPIXELS", 40);
/** How long a presigned upload URL, and the `pending` row behind it, stay
 * valid. */
export const RESERVATION_TTL_MINUTES = numberFromEnv(
  "CMS_MEDIA_RESERVATION_MINUTES",
  15,
);
/** How long a trashed asset keeps its bytes before the sweep removes them.
 * This is the backup that git used to provide when these files were committed
 * to the repository. */
export const TRASH_GRACE_DAYS = numberFromEnv("CMS_MEDIA_TRASH_GRACE_DAYS", 30);

/** Beyond this, the shared renderer serves the master untouched rather than
 * making every cold cache pay for a slow transform. */
export const UNOPTIMIZED_MEGAPIXELS = 24;

export type UploadRejection = { code: string; message: string };

/** The cheap checks, run before a presigned URL is handed out: is this
 * plausibly one of our formats, and is it a sane size? Anything that gets past
 * here is checked again against the actual bytes. */
export function checkReservation(input: {
  filename: string;
  contentType: string;
  byteSize: number;
}): UploadRejection | null {
  if (!isSupportedMimeType(input.contentType)) {
    return {
      code: "media.unsupported-format",
      message: `Formato no admitido: ${input.contentType || "desconocido"}. Se aceptan JPEG, PNG, WebP, AVIF y GIF.`,
    };
  }
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return {
      code: "media.empty-file",
      message: "El archivo está vacío.",
    };
  }
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    return {
      code: "media.too-large",
      message: `El archivo pesa ${formatBytes(input.byteSize)} y el máximo es ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }
  if (!input.filename.trim()) {
    return {
      code: "media.no-filename",
      message: "El archivo no tiene nombre.",
    };
  }
  return null;
}

/** The format of a buffer according to its leading bytes.
 *
 * Never the client's claim: an extension is a naming convention and a
 * `Content-Type` is a request header, and neither is evidence. A file that
 * sniffs as nothing supported is refused before any decoder touches it. */
export function sniffMimeType(
  bytes: Buffer | Uint8Array,
): SupportedMimeType | null {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (b.length < 12) return null;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  const head6 = b.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";
  if (
    b.subarray(0, 4).toString("ascii") === "RIFF" &&
    b.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO-BMFF: `ftyp` at offset 4, then the major brand. AVIF files in the wild
  // often declare `mif1` as major and `avif` among the compatible brands, so
  // read a little further than the major brand alone.
  if (b.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = b.subarray(8, Math.min(b.length, 64)).toString("ascii");
    if (/avif|avis/.test(brands)) return "image/avif";
  }
  return null;
}

/** The decoded-image checks, run at finalization against the real dimensions. */
export function checkDecoded(input: {
  width: number;
  height: number;
  byteSize: number;
}): UploadRejection | null {
  if (!input.width || !input.height) {
    return {
      code: "media.undecodable",
      message: "No se pudo leer la imagen: puede estar dañada o incompleta.",
    };
  }
  const megapixels = (input.width * input.height) / 1_000_000;
  if (megapixels > MAX_MEGAPIXELS) {
    return {
      code: "media.too-many-pixels",
      message: `La imagen tiene ${megapixels.toFixed(1)} megapíxeles y el máximo es ${MAX_MEGAPIXELS}.`,
    };
  }
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    return {
      code: "media.too-large",
      message: `El archivo pesa ${formatBytes(input.byteSize)} y el máximo es ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }
  return null;
}

/** Alt text rules (cms.md). Blank alt is a claim that the image
 * carries no information, and that claim has to be made explicitly — a screen
 * reader cannot tell an intentional decoration from a forgotten description. */
export function checkAltDecision(input: {
  defaultAlt: string;
  decorative: boolean;
}): UploadRejection | null {
  const alt = input.defaultAlt.trim();
  if (input.decorative && alt) {
    return {
      code: "media.decorative-with-alt",
      message:
        "Una imagen decorativa no lleva texto alternativo. Quita la marca de decorativa o borra el texto.",
    };
  }
  if (!input.decorative && !alt) {
    return {
      code: "media.missing-alt",
      message:
        "Falta el texto alternativo. Descríbela, o márcala como decorativa si no aporta información.",
    };
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
