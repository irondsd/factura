import "server-only";
import { randomUUID } from "node:crypto";
import type { Metadata, Sharp } from "sharp";
import {
  isMediaStorageConfigured,
  mediaStorageProblem,
  publicUrl,
  putObject,
} from "@/cms/media/server/storage";
import { loadSharp, MediaUploadError } from "@/cms/media/server/uploads";
import {
  MAX_MEGAPIXELS,
  sniffMimeType,
} from "@/cms/media/validation/upload";
import {
  formatImageBytes,
  MAX_TASK_IMAGE_BYTES,
  MAX_TASK_IMAGE_WIDTH,
  taskImageKey,
} from "../images";

// A screenshot pasted into a task: bytes in, a public WebP out.
//
// Much lighter than the media library's pipeline on purpose. There is no
// catalog row, no staging key and no purge — the image goes up in one request,
// is written once, and is never deleted. What it keeps from that pipeline is
// the part that is about trust: the format is read from the bytes, the pixel
// count is bounded before decoding, and the image is always re-encoded, so
// nothing of the original container (metadata, a polyglot payload) is stored.

export class TaskImageError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TaskImageError";
    this.status = status;
  }
}

export type ProcessedTaskImage = {
  bytes: Buffer;
  width: number;
  height: number;
};

/** Validate, scale down to `MAX_TASK_IMAGE_WIDTH` if wider, and convert to
 * WebP. Separate from storage so it can be tested without a bucket. */
export async function processTaskImage(
  raw: Buffer,
): Promise<ProcessedTaskImage> {
  if (raw.length === 0) throw new TaskImageError("La imagen está vacía.");
  if (raw.length > MAX_TASK_IMAGE_BYTES) {
    throw new TaskImageError(
      `La imagen pesa ${formatImageBytes(raw.length)} y el máximo es ${formatImageBytes(MAX_TASK_IMAGE_BYTES)}.`,
      413,
    );
  }
  if (!sniffMimeType(raw)) {
    throw new TaskImageError(
      "El contenido no es una imagen PNG, JPEG, WebP, AVIF ni GIF.",
      415,
    );
  }

  let decode: Awaited<ReturnType<typeof loadSharp>>;
  try {
    decode = await loadSharp();
  } catch (error) {
    throw new TaskImageError(
      error instanceof MediaUploadError
        ? error.message
        : "No se pudo cargar el procesador de imágenes.",
      500,
    );
  }

  // A small file can decode into an enormous surface; sharp refuses anything
  // over this many pixels before allocating it.
  const limitInputPixels = MAX_MEGAPIXELS * 1_000_000;
  let source: Sharp;
  let probe: Metadata;
  try {
    source = decode(raw, { animated: true, failOn: "error", limitInputPixels });
    probe = await source.metadata();
  } catch {
    throw new TaskImageError(
      "No se pudo leer la imagen: puede estar dañada o ser demasiado grande.",
    );
  }

  const animated = (probe.pages ?? 1) > 1;
  // `.rotate()` applies EXIF orientation, which a phone photo may carry. It
  // doesn't apply to an animation, and an animated GIF carries none.
  const pipeline = animated ? source : source.rotate();
  let bytes: Buffer;
  try {
    bytes = await pipeline
      .resize({ width: MAX_TASK_IMAGE_WIDTH, withoutEnlargement: true })
      // Screenshots are mostly text and flat UI: high quality and full-
      // resolution chroma keep small type and coloured edges crisp.
      .webp({ quality: 90, smartSubsample: true })
      .toBuffer();
  } catch {
    throw new TaskImageError("No se pudo convertir la imagen.");
  }

  // Read back from the output: orientation can swap the axes, and sharp
  // reports an animation's height as every frame stacked.
  const final = await decode(bytes, { animated: true }).metadata();
  const width = final.width ?? 0;
  const height = animated
    ? (final.pageHeight ?? final.height ?? 0)
    : (final.height ?? 0);
  if (!width || !height)
    throw new TaskImageError("No se pudo leer la imagen convertida.");

  return { bytes, width, height };
}

/** Process and store one pasted image; returns its public address. */
export async function uploadTaskImage(raw: Buffer): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  if (!isMediaStorageConfigured()) {
    throw new TaskImageError(
      mediaStorageProblem() ?? "Almacenamiento de medios sin configurar.",
      503,
    );
  }
  const image = await processTaskImage(raw);
  const key = taskImageKey(randomUUID(), image.width, image.height);
  await putObject({
    key,
    body: image.bytes,
    contentType: "image/webp",
    immutable: true,
  });
  return { url: publicUrl(key), width: image.width, height: image.height };
}
