// Where CMS media bytes are served from.
//
// This one value is needed on both sides of the CMS boundary — the private
// upload adapter writes objects there, and the public renderer points
// `next/image` at them — so it lives in the shared content system rather than
// inside `src/cms`, which the public site may not import. Reading an
// environment variable is all it does; nothing here talks to S3.

/** The public origin, without a trailing slash. Empty when unconfigured, which
 * is how the CMS detects that the media library is unavailable. */
export function mediaPublicOrigin(): string {
  return (process.env.CMS_MEDIA_PUBLIC_ORIGIN ?? "").replace(/\/+$/, "");
}

/** The source URL for a stored object key. Never a presigned URL: those are
 * bearer credentials with an expiry, which is right for upload and wrong for
 * page content. */
export function publicMediaUrl(objectKey: string): string {
  return `${mediaPublicOrigin()}/${objectKey}`;
}
