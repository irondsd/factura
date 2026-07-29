import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible storage for original PDFs. Configured entirely via env so the
// same code targets MinIO locally and Cloudflare R2 / AWS S3 / Backblaze in
// production — only the endpoint/credentials change. When unset the app runs
// text-only (no upload, no View PDF) so it works before storage is wired up.
const BUCKET = process.env.S3_BUCKET;
const ENDPOINT = process.env.S3_ENDPOINT;
const REGION = process.env.S3_REGION ?? "us-east-1";
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;
// MinIO and most non-AWS providers need path-style addressing.
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

export function isStorageConfigured(): boolean {
  return Boolean(BUCKET && ACCESS_KEY && SECRET_KEY);
}

let cached: S3Client | null = null;
function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      forcePathStyle: FORCE_PATH_STYLE,
      credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
    });
  }
  return cached;
}

/** Filesystem-safe, collision-free key under `<prefix>/<scope>/`. */
function buildKey(prefix: string, scope: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${prefix}/${scope}/${crypto.randomUUID()}-${safe}`;
}

async function put(key: string, bytes: Uint8Array): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: "application/pdf",
    }),
  );
  return key;
}

/** Upload a PDF server-side and return its key. The server now sits between the
 * browser and the bucket (it already holds the bytes to extract text), so there's
 * no presigned browser PUT and therefore no cross-origin CORS rule to configure. */
export function putObject(
  userId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  return put(buildKey("bills", userId, fileName), bytes);
}

/** Upload a PDF dropped on the public /probar page, keyed by submission rather
 * than by user — there is no user yet. The separate `submissions/` prefix keeps
 * anonymous uploads identifiable in the bucket, which is what makes the
 * retention sweep auditable and lets a lifecycle rule target them if you ever
 * want one. On claim the object is NOT moved: the key transfers to
 * `bills.storageKey` as-is and the submission row gives it up, so exactly one
 * row owns each object (see claimSubmissions). */
export function putSubmissionObject(
  submissionId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  return put(buildKey("submissions", submissionId, fileName), bytes);
}

/** Fetch a stored PDF's raw bytes — used to re-extract text from the file. */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Stored object ${key} has no body`);
  return bytes;
}

/** Presigned GET so the user can view/re-download their stored PDF. */
export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 300 },
  );
}

/** Remove a stored PDF. Idempotent — S3 DeleteObject succeeds on a missing
 * key, so a bill whose object is already gone stays deletable. */
export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
