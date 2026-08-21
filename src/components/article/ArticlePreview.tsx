import { MediaImage } from "@/content-system/media/MediaImage";
import type { MediaRef } from "@/content-system/media/repository";
import { cn } from "@/lib/cn";

/** Decorative 16:9 article preview. The adjacent headline already names the
 * page, so a second spoken description would be redundant — which is why this
 * renders `alt=""` even when the library holds a default description. */
export function ArticlePreview({
  media,
  className,
}: {
  media?: MediaRef | null;
  className?: string;
}) {
  if (!media) return null;
  return (
    <MediaImage
      media={media}
      alt=""
      placement="preview"
      className={cn(
        "w-full aspect-video object-cover border border-line bg-card",
        className,
      )}
    />
  );
}
