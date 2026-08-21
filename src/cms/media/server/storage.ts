import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  mediaPublicOrigin,
  publicMediaUrl,
} from "@/content-system/media/origin";

// S3-compatible storage for CMS media, with its own bucket and its own
// credentials (cms.md §9.4).
//
// Not a prefix inside the bill-PDF bucket, and not a shared client:
// `@/server/storage` is private bill storage, and `src/cms/boundaries.test.ts`
// forbids importing it from here. The separation is the point — these objects
// are *publicly readable*, because the Next.js image optimizer fetches remote
// sources without forwarding authentication headers, and a bucket holding
// people's utility bills must never be that.
//
// Configured entirely through environment variables so the same code targets
// MinIO locally and R2 / S3 / Backblaze in production. Unset means the media
// library is unavailable rather than broken: the CMS says so, and nothing else
// in the app notices.

// Only two of these are genuinely media's own. The connection is almost always
// the *same* S3 account as the bill storage — same endpoint, same keys — so the
// rest fall back to the existing `S3_*` variables rather than making a
// deployment state its credentials twice and letting the two drift.
//
// A separate *bucket* is not optional, though, and that is the one thing this
// module will not fall back on. These objects have to be publicly readable,
// because the Next.js image optimizer fetches a remote source without
// forwarding credentials — and on R2 public access is a per-bucket switch, not
// a per-prefix one. Sharing a bucket with `bills/` would mean either publishing
// every stored utility bill or putting a Worker in front of the whole thing.
const BUCKET = process.env.CMS_MEDIA_S3_BUCKET;
const ENDPOINT = process.env.CMS_MEDIA_S3_ENDPOINT ?? process.env.S3_ENDPOINT;
const REGION =
  process.env.CMS_MEDIA_S3_REGION ?? process.env.S3_REGION ?? "auto";
const ACCESS_KEY =
  process.env.CMS_MEDIA_S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY =
  process.env.CMS_MEDIA_S3_SECRET_ACCESS_KEY ??
  process.env.S3_SECRET_ACCESS_KEY;
const FORCE_PATH_STYLE =
  (process.env.CMS_MEDIA_S3_FORCE_PATH_STYLE ??
    process.env.S3_FORCE_PATH_STYLE) === "true";

/** Where a browser fetches the bytes. On R2 this is a controlled custom domain
 * (`media.factura.uno`); `r2.dev` is a rate-limited development endpoint and is
 * not a production answer.
 *
 * Read through the shared content system, not from `process.env` here: the
 * public renderer needs the same value and may not import `src/cms`, so one
 * module owns it and both sides agree by construction. */
const PUBLIC_ORIGIN = mediaPublicOrigin() || undefined;

/** Everything this module writes lives under one prefix, so a bucket shared
 * with something else later is still separable, and so the reconciliation sweep
 * has an exact thing to list. */
export const MEDIA_PREFIX = "cms-media";

/** Staging. A presigned PUT may only ever target a key under here.
 *
 * The two namespaces are what let an upload be both direct-to-storage *and*
 * have its EXIF stripped: the browser writes here, finalization reads it,
 * processes it, writes the master, and deletes this. A master key is therefore
 * written once, by the server, from bytes it has already inspected — and the
 * stored hash describes exactly what is served. */
export const INCOMING_PREFIX = `${MEDIA_PREFIX}/_incoming`;

export function isMediaStorageConfigured(): boolean {
  return Boolean(BUCKET && ACCESS_KEY && SECRET_KEY && PUBLIC_ORIGIN);
}

/** Why the media library is unavailable, in words an editor can act on. Null
 * when it is available. */
export function mediaStorageProblem(): string | null {
  if (isMediaStorageConfigured()) return null;
  const missing = [
    BUCKET ? null : "CMS_MEDIA_S3_BUCKET",
    ACCESS_KEY ? null : "S3_ACCESS_KEY_ID",
    SECRET_KEY ? null : "S3_SECRET_ACCESS_KEY",
    PUBLIC_ORIGIN ? null : "CMS_MEDIA_PUBLIC_ORIGIN",
  ].filter((name): name is string => name !== null);
  return `Almacenamiento de medios sin configurar: falta ${missing.join(", ")}.`;
}

let cached: S3Client | null = null;
function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      forcePathStyle: FORCE_PATH_STYLE,
      credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
      // Recent versions of the AWS SDK add a CRC32 checksum to every request by
      // default, and when a `PutObject` is *presigned* that checksum is
      // computed over the (empty) body the signer has in hand and hoisted into
      // the signed query string. The browser then uploads real bytes against a
      // URL that declares the checksum of nothing.
      //
      // MinIO ignores it, so this passes locally and would fail on the first
      // upload against a stricter S3 implementation. Integrity is not lost:
      // finalization hashes the master with SHA-256, which is what the row
      // stores and what the reconciliation compares.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return cached;
}

export const incomingKey = (reservationId: string): string =>
  `${INCOMING_PREFIX}/${reservationId}`;

/** The immutable master key. Namespaced by media id, which is why two rows
 * holding identical bytes are two independent objects: purging one can never
 * orphan the other. */
export const masterKey = (
  mediaId: string,
  sha256: string,
  extension: string,
): string => `${MEDIA_PREFIX}/${mediaId}/${sha256.slice(0, 16)}.${extension}`;

/** The public source URL for an object key. */
export const publicUrl = publicMediaUrl;

/** A short-lived credential for one exact staging key.
 *
 * Scoped to that key and nothing else — this is the only credential that ever
 * reaches a browser, and it can write one random path under `_incoming/`.
 *
 * What it does *not* constrain is what lands there. `ContentType` is passed so
 * the staged object is labelled, but the SDK does not sign it, and
 * `content-length` cannot be hoisted into a presigned URL portably. Neither
 * matters, because nothing downstream trusts them: finalization reads the
 * object, weighs it, sniffs its actual magic bytes, and re-encodes it into the
 * master. The blast radius of the gap is a CMS member — two trusted people —
 * writing a wrong or oversized object into a staging key that finalization
 * rejects and the sweep deletes. */
export async function presignUpload(input: {
  key: string;
  contentType: string;
  expiresInSeconds: number;
}): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: input.key,
      ContentType: input.contentType,
    }),
    { expiresIn: input.expiresInSeconds },
  );
}

/** Read an object into memory. Only finalization does this, on objects whose
 * size it has already checked. */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const response = await client().send(
    new GetObjectCommand({ Bucket: BUCKET!, Key: key }),
  );
  const body = response.Body;
  if (!body) throw new Error(`Empty body for ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** The size of a stored object, or null when it is not there. Used to weigh a
 * staged upload before reading it into memory. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const response = await client().send(
      new ListObjectsV2Command({ Bucket: BUCKET!, Prefix: key, MaxKeys: 1 }),
    );
    const found = response.Contents?.find((object) => object.Key === key);
    return found?.Size ?? null;
  } catch {
    return null;
  }
}

export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  /** Master objects never change, so they may be cached for a year. The staging
   * copy is never served to anyone. */
  immutable?: boolean;
}): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ...(input.immutable
        ? { CacheControl: "public, max-age=31536000, immutable" }
        : {}),
    }),
  );
}

/** Delete an object. Idempotent by contract — S3 delete of a missing key
 * succeeds — so a retried purge is safe. */
export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
}

/** Every key under a prefix, following pagination to the end.
 *
 * This is what the library grid must *not* do — PostgreSQL is the catalog — but
 * it is exactly how reconciliation proves there are no strays. It is the only
 * check that can catch a bug in the purge path rather than assuming it worked.
 * At a few hundred objects it is one request. */
export async function listAllKeys(
  prefix: string = MEDIA_PREFIX,
): Promise<{ key: string; size: number; lastModified: Date | null }[]> {
  const out: { key: string; size: number; lastModified: Date | null }[] = [];
  let token: string | undefined;
  do {
    const response = await client().send(
      new ListObjectsV2Command({
        Bucket: BUCKET!,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const object of response.Contents ?? []) {
      if (!object.Key) continue;
      out.push({
        key: object.Key,
        size: object.Size ?? 0,
        lastModified: object.LastModified ?? null,
      });
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return out;
}
