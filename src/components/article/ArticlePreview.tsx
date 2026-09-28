import { MediaImage } from "@/content-system/media/MediaImage";
import type { MediaRef } from "@/content-system/media/repository";
import { cn } from "@/lib/cn";

/** An article's 16:9 preview. Its alt is the library's description when there
 * is one, else "Vista previa: <title>" — never empty, since a bare `alt=""`
 * leaves the image with no text for image search and gets flagged by SEO
 * audits on every listing that shows previews. An image marked decorative in
 * the library still renders `alt=""`: that is an editor's explicit call. */
export function ArticlePreview({
  media,
  title,
  className,
}: {
  media?: MediaRef | null;
  /** The page the preview belongs to, for when the library has no alt. */
  title: string;
  className?: string;
}) {
  if (!media) return null;
  const alt = media.decorative
    ? ""
    : media.defaultAlt.trim() || `Vista previa: ${title}`;
  return (
    <MediaImage
      media={media}
      alt={alt}
      placement="preview"
      className={cn(
        "w-full aspect-video object-cover border border-line bg-card",
        className,
      )}
    />
  );
}
