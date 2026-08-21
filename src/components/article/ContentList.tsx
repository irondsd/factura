import Link from "next/link";
import { ArticlePreview } from "@/components/article/ArticlePreview";
import { resolveMediaRefs } from "@/content-system/media/repository";
import { formatContentDate } from "@/lib/content-date";

export type ContentListItem = {
  key: string;
  href: string;
  title: string;
  summary: string;
  /** Media-library id of the row's illustration. */
  previewMediaId?: string;
  date: string;
};

/** The row shared by guides, statistics and research. `/guias` is the mobile
 * reference: a preview takes the full row width above the copy until `sm`, then
 * becomes the compact thumbnail beside it. */
export async function ContentList({
  items,
  datePrefix,
  titleAs: Title = "h2",
}: {
  items: ContentListItem[];
  datePrefix?: string;
  titleAs?: "h2" | "h3";
}) {
  // One query for the whole list, resolved here rather than per row: a listing
  // of twenty guides should cost one round trip, not twenty.
  const media = await resolveMediaRefs(
    items.map((item) => item.previewMediaId).filter((id): id is string => !!id),
  );

  return (
    <ul className="list-none p-0 m-0">
      {items.map((item) => (
        <li key={item.key} className="border-b border-line">
          <Link
            href={item.href}
            className="group flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-[22px] no-underline py-6"
          >
            {media.get(item.previewMediaId ?? "") && (
              <ArticlePreview
                media={media.get(item.previewMediaId ?? "")}
                className="flex-none w-full sm:w-40"
              />
            )}
            <div className="w-full min-w-0 sm:flex-1">
              <div className="flex flex-col gap-y-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
                <Title className="min-w-0 font-display font-semibold text-[20px] sm:text-[23px] tracking-tight text-ink m-0 transition-colors group-hover:text-accent">
                  {item.title}
                </Title>
                <span className="flex-none font-mono text-micro uppercase tracking-label-wide text-muted">
                  {datePrefix}
                  {formatContentDate(item.date)}
                </span>
              </div>
              <p className="font-mono text-sm leading-[1.7] text-muted max-w-[70ch] mt-2 mb-0">
                {item.summary}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
