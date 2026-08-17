import { cn } from "@/lib/cn";

/** Decorative 16:9 article preview. The adjacent headline already names the
 * page, so a second spoken description would be redundant. */
export function ArticlePreview({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={960}
      height={540}
      decoding="async"
      className={cn(
        "w-full aspect-video object-cover border border-line bg-card",
        className,
      )}
    />
  );
}
