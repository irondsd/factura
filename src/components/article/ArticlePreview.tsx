import { MediaImage } from "@/content-system/media/MediaImage";
import type { MediaRef } from "@/content-system/media/repository";
import { cn } from "@/lib/cn";

/** Decorative 16:9 article preview. The adjacent headline already names the
 * page, so a second spoken description would be redundant — which is why this
 * renders `alt=""` even when the library holds a default description.
 *
 * Two sources while the media migration runs: a `MediaRef` from the library,
 * which goes through `next/image`, and a legacy `/img/**` path committed to the
 * repository, which cannot. Step 7 of the rollout removes the second. */
export function ArticlePreview({
  media,
  src,
  className,
}: {
  media?: MediaRef | null;
  src?: string | null;
  className?: string;
}) {
  const shape = cn(
    "w-full aspect-video object-cover border border-line bg-card",
    className,
  );

  if (media) {
    return (
      <MediaImage media={media} alt="" placement="preview" className={shape} />
    );
  }
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={960}
      height={540}
      decoding="async"
      className={shape}
    />
  );
}
