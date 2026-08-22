import Image from "next/image";
import type { MediaRef } from "./repository";

// The one component that renders a library image, on the public site and in the
// CMS preview alike (cms.md).
//
// It exists so that the things easy to get wrong per call site are decided once:
// the intrinsic dimensions that stop layout shift, the responsive `sizes` for
// each placement, and when optimization has to be skipped. None of those are
// author-controlled — an editor writes Markdown, not image plumbing.

/** Where the image sits, which is what `sizes` needs to know. The article
 * column is 680 px at its widest; a preview card and a sidebar are smaller and
 * should not download a full-width variant. */
export type MediaPlacement = "article" | "preview" | "sidebar";

const SIZES: Record<MediaPlacement, string> = {
  article: "(max-width: 719px) 100vw, 680px",
  preview: "(max-width: 719px) 100vw, (max-width: 1023px) 50vw, 360px",
  sidebar: "(max-width: 1023px) 100vw, 300px",
};

/** Beyond this the optimizer's work stops being worth its latency on a cold
 * cache, and the master is served as-is. */
const UNOPTIMIZED_PIXELS = 24_000_000;

export function MediaImage({
  media,
  alt,
  placement = "article",
  className,
  priority = false,
}: {
  media: MediaRef;
  /** The alt for *this use*. Falls back to the library default, which is a
   * suggestion rather than an answer — the same image means different things in
   * different articles. An explicitly empty string is honoured: it is how a
   * decorative use is spelled. */
  alt?: string;
  placement?: MediaPlacement;
  className?: string;
  /** Only for a measured above-the-fold placement. Everything else lazy-loads. */
  priority?: boolean;
}) {
  const resolved = alt ?? (media.decorative ? "" : media.defaultAlt);

  // Animated GIFs must not be optimized: the optimizer would turn one into its
  // first frame, which is a different asset rather than a smaller one. Very
  // large masters skip it too. Neither is something an author can ask for.
  const unoptimized =
    media.mimeType === "image/gif" ||
    media.width * media.height > UNOPTIMIZED_PIXELS;

  return (
    <Image
      src={media.src}
      alt={resolved}
      width={media.width}
      height={media.height}
      sizes={SIZES[placement]}
      unoptimized={unoptimized}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      className={className}
    />
  );
}
