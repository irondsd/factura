// The editorial permalink: the only shape of media reference that may appear in
// authored content (cms.md).
//
//     /media/8f2c…/medidor-de-luz.jpg
//
// Three values are deliberately kept apart, and this module owns the middle
// one:
//
//   media id            stable relational identity, in PostgreSQL
//   editorial permalink portable, human-readable, in MDX and page metadata
//   object origin       where next/image fetches bytes, from configuration
//
// Resolution is by UUID. The filename is descriptive only, so renaming an
// image's library title never breaks an article — and moving from R2 to S3 or
// another CDN changes configuration rather than every page.

/** The prefix authored content uses. Not the bucket, not the CDN. */
export const MEDIA_PERMALINK_PREFIX = "/media";

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** `/media/<uuid>/<filename>.<ext>`.
 *
 * The trailing extension is mandatory, and not for looks: `src/proxy.ts`
 * rewrites every path it matches into the `/es` tree and excludes anything
 * containing a dot, so an extensionless permalink would be rewritten to
 * `/es/media/…` and 404. The route is also excluded by name, but content that
 * always carries an extension keeps this working even if that list changes. */
const PERMALINK_RE = new RegExp(
  `^${MEDIA_PERMALINK_PREFIX}/(${UUID})/([^/?#]+\\.[a-zA-Z0-9]+)$`,
);

export type ParsedPermalink = { id: string; filename: string };

/** The media id in a permalink, or null when this is not one. Case-insensitive
 * on the UUID, but the id is returned lowercased so it compares equal to what
 * PostgreSQL stores. */
export function parseMediaPermalink(url: string): ParsedPermalink | null {
  const match = PERMALINK_RE.exec(url.trim());
  if (!match) return null;
  return { id: match[1].toLowerCase(), filename: match[2] };
}

/** Every permalink-shaped path anywhere in `text`, with where it starts. No
 * parsing and no context — which is the point: it is the fallback for a body
 * the MDX parser cannot read, where missing a reference would let the images
 * a retained version still shows be purged. It over-reports rather than
 * under-reports, which is the right way round for usage. */
export function scanMediaPermalinks(
  text: string,
): { id: string; index: number }[] {
  const re = new RegExp(
    `${MEDIA_PERMALINK_PREFIX}/(${UUID})/[^/?#\\s)"'<>]+\\.[a-zA-Z0-9]+`,
    "g",
  );
  return [...text.matchAll(re)].map((match) => ({
    id: match[1].toLowerCase(),
    index: match.index ?? 0,
  }));
}

export const isMediaPermalink = (url: string): boolean =>
  parseMediaPermalink(url) !== null;

/** Build the permalink for an asset. The filename is derived from the library
 * title so a reader hovering a link sees something meaningful; nothing resolves
 * by it. */
export function buildMediaPermalink(input: {
  id: string;
  displayName: string;
  originalFilename: string;
}): string {
  const extension = extensionOf(input.originalFilename) || "jpg";
  const stem = slugifyFilename(input.displayName) || "imagen";
  return `${MEDIA_PERMALINK_PREFIX}/${input.id}/${stem}.${extension}`;
}

function extensionOf(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

/** ASCII, lowercase, hyphen-separated — a filename that survives every
 * filesystem, URL bar and copy-paste between here and a reader's browser. */
export function slugifyFilename(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
