import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Metadata, Sharp } from "sharp";
import {
  checkDecoded,
  EXTENSION_FOR,
  isSupportedMimeType,
  MAX_UPLOAD_BYTES,
  sniffMimeType,
  type SupportedMimeType,
  type UploadRejection,
} from "../validation/upload";
import {
  deleteObject,
  getObjectBytes,
  headObjectSize,
  incomingKey,
  masterKey,
  putObject,
} from "./storage";

// Turning uploaded bytes into a stored master.
//
// The shape here is the resolution of what would otherwise be a contradiction
// (cms.md §9.4/§9.5): an upload that goes straight from the browser to
// object storage cannot also have its EXIF stripped, because stripping changes
// the bytes and the key was already written. Two namespaces fix it —
//
//   cms-media/_incoming/<reservation>   the browser's presigned PUT lands here
//   cms-media/<media-id>/<sha>.<ext>    the server writes this, once, forever
//
// — so the master is written by the server from bytes it has already inspected,
// and the stored hash describes exactly what is served.
//
// Re-encoding is also the polyglot defence. A file crafted to be simultaneously
// a valid image and something executable does not survive being decoded to
// pixels and encoded again; nothing of the original container reaches the
// bucket.

export class MediaUploadError extends Error {
  readonly code: string;
  constructor(rejection: UploadRejection) {
    super(rejection.message);
    this.code = rejection.code;
    this.name = "MediaUploadError";
  }
}

/** sharp, loaded on first use rather than at module load.
 *
 * `import sharp from "sharp"` resolves a **native binary** the moment anything
 * in this module's import graph is touched — and that graph reaches every media
 * server action, including the read-only ones, through `./service`. A
 * deployment where the platform binary is missing or mismatched would therefore
 * fail to *list* images, with an error that says nothing about uploads.
 *
 * A codec is needed only to process bytes. Listing, editing metadata, trashing
 * and rendering never touch one, and now never load one. The promise is cached,
 * so repeated uploads pay the resolution once.
 *
 * `import type` above is erased at compile time and loads nothing. */
let sharpModule: Promise<typeof import("sharp").default> | null = null;
function sharp(): Promise<typeof import("sharp").default> {
  sharpModule ??= import("sharp")
    .then((module) => module.default)
    .catch((cause) => {
      // A native module that will not load is an environment problem, not a
      // problem with the file being uploaded, and it must say so. Left as a
      // bare module error it surfaces as an opaque 500 with a digest, which
      // tells whoever is uploading nothing at all.
      sharpModule = null; // so a later request can retry rather than cache the failure
      throw new MediaUploadError({
        code: "media.no-encoder",
        message:
          "No se pudo cargar el procesador de imágenes (sharp) en este entorno. " +
          "Es un problema del despliegue, no del archivo: revisa que el binario " +
          `nativo de sharp esté instalado para esta plataforma. (${cause instanceof Error ? cause.message : String(cause)})`,
      });
    });
  return sharpModule;
}

export type ProcessedImage = {
  bytes: Buffer;
  mimeType: SupportedMimeType;
  extension: string;
  width: number;
  height: number;
  sha256: string;
  byteSize: number;
};

export const stagingKeyFor = (reservationId: string): string =>
  incomingKey(reservationId);

export const newReservationId = (): string => randomUUID();

/** Read the staged object, validate it, and produce the master.
 *
 * Every check here re-does one the reservation already made, against the thing
 * that actually arrived rather than what was promised. The browser is not a
 * source of truth about its own upload. */
export async function processStagedUpload(
  stagingKey: string,
): Promise<ProcessedImage> {
  const size = await headObjectSize(stagingKey);
  if (size === null) {
    throw new MediaUploadError({
      code: "media.not-uploaded",
      message: "No se encontró el archivo subido. Vuelve a intentarlo.",
    });
  }
  if (size > MAX_UPLOAD_BYTES) {
    // Weighed before it is read: the point of a size limit is not to allocate
    // the thing it is limiting.
    throw new MediaUploadError({
      code: "media.too-large",
      message: `El archivo subido supera el máximo permitido.`,
    });
  }

  const raw = await getObjectBytes(stagingKey);
  return processImageBytes(raw);
}

/** The pure-ish core: bytes in, master out. Separated from storage so it can be
 * tested against fixtures without a bucket. */
export async function processImageBytes(raw: Buffer): Promise<ProcessedImage> {
  const sniffed = sniffMimeType(raw);
  if (!sniffed || !isSupportedMimeType(sniffed)) {
    throw new MediaUploadError({
      code: "media.unsupported-format",
      message:
        "El contenido del archivo no es una imagen JPEG, PNG, WebP, AVIF ni GIF.",
    });
  }

  const decode = await sharp();
  let source: Sharp;
  let probe: Metadata;
  try {
    source = decode(raw, { animated: true, failOn: "error" });
    probe = await source.metadata();
  } catch {
    throw new MediaUploadError({
      code: "media.undecodable",
      message: "No se pudo leer la imagen: puede estar dañada o incompleta.",
    });
  }

  const animated = (probe.pages ?? 1) > 1;
  const bytes = animated ? raw : await reencode(raw, sniffed);

  // Dimensions are read from the *output*, because applying EXIF orientation
  // can swap width and height, and the stored numbers are what `next/image`
  // uses to reserve space before the image arrives.
  const final = await decode(bytes, { animated: true }).metadata();
  const width = final.width ?? 0;
  // sharp reports an animated image's height as every frame stacked; one frame
  // is what a reader sees.
  const height = animated
    ? Math.round((final.pageHeight ?? final.height ?? 0) || 0)
    : (final.height ?? 0);

  const rejection = checkDecoded({ width, height, byteSize: bytes.length });
  if (rejection) throw new MediaUploadError(rejection);

  return {
    bytes,
    mimeType: sniffed,
    extension: EXTENSION_FOR[sniffed],
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.length,
  };
}

/** Re-encode in the same format, applying EXIF orientation and dropping every
 * other piece of metadata.
 *
 * Same format on purpose: the master is the archival copy, and `next/image`
 * re-encodes for delivery anyway, so converting here would lose fidelity to no
 * end. Quality is high for the same reason — this is the source, not the
 * artifact a reader downloads.
 *
 * Animated GIFs skip this entirely (see the caller): re-encoding an animation
 * frame by frame is a visible change to the asset, and a GIF carries no GPS
 * metadata to strip. */
async function reencode(
  raw: Buffer,
  mimeType: SupportedMimeType,
): Promise<Buffer> {
  // `.rotate()` with no argument means "apply the EXIF orientation tag", which
  // is what makes the stored pixels match what the photographer saw.
  const pipeline = (await sharp())(raw, { failOn: "error" }).rotate();
  switch (mimeType) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    case "image/png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case "image/webp":
      return pipeline.webp({ quality: 92 }).toBuffer();
    case "image/avif":
      return pipeline.avif({ quality: 70 }).toBuffer();
    case "image/gif":
      return pipeline.gif().toBuffer();
  }
}

/** Write the master and drop the staging copy. The staging delete is
 * best-effort: a master that exists with an orphaned staging object is a tidy-up
 * job for the reconciliation sweep, while failing the upload at this point would
 * throw away work that already succeeded. */
export async function storeMaster(input: {
  mediaId: string;
  stagingKey: string;
  processed: ProcessedImage;
}): Promise<string> {
  const key = masterKey(
    input.mediaId,
    input.processed.sha256,
    input.processed.extension,
  );
  await putObject({
    key,
    body: input.processed.bytes,
    contentType: input.processed.mimeType,
    immutable: true,
  });
  try {
    await deleteObject(input.stagingKey);
  } catch {
    // Left for reconciliation.
  }
  return key;
}
