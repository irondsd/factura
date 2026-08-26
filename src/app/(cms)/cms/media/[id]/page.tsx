import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { CmsIcon } from "@/cms/icons";
import { cmsPageMetadata } from "@/cms/metadata";
import { MediaDetail } from "@/cms/media/components/MediaDetail";
import { cmsMediaService } from "@/cms/media/server/service";
import { CmsNotFoundError } from "@/cms/server/errors";
import { STORAGE_LIMITS } from "@/cms/media/server/purge";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Medios");
}

export default async function CmsMediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCmsMember(`/cms/media/${id}`);

  const detail = await cmsMediaService.get(id).catch((error) => {
    if (error instanceof CmsNotFoundError) return null;
    throw error;
  });
  if (!detail) notFound();

  const collections = await cmsMediaService.listCollections();

  return (
    <CmsShell actor={actor}>
      <Link
        href="/cms/media"
        className="inline-flex items-center gap-2 font-mono text-micro uppercase tracking-label-wide text-muted no-underline hover:text-accent"
      >
        <CmsIcon name="arrowLeft" size="sm" />
        Medios
      </Link>
      <h1 className="mt-2 mb-6 font-display text-[26px] font-semibold">
        {detail.asset.displayName}
      </h1>
      <MediaDetail
        asset={detail.asset}
        usage={detail.usage}
        duplicates={detail.duplicates}
        portraitOf={detail.portraitOf}
        collections={collections}
        graceDays={STORAGE_LIMITS.trashGraceDays}
      />
    </CmsShell>
  );
}
