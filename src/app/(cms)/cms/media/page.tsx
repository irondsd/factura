import type { Metadata } from "next";
import { requireCmsMember } from "@/cms/auth/requireCmsMember";
import { CmsShell } from "@/cms/components/CmsShell";
import { cmsPageMetadata } from "@/cms/metadata";
import { MediaLibrary } from "@/cms/media/components/MediaLibrary";
import { cmsMediaService } from "@/cms/media/server/service";
import { mediaStorageProblem } from "@/cms/media/server/storage";
import { STORAGE_LIMITS } from "@/cms/media/server/purge";
import { formatBytes } from "@/cms/media/validation/upload";
import {
  mediaLibraryFilter,
  mediaLibraryViewFromParam,
} from "@/cms/media/query";

// Dynamic and uncached: the library is a working surface, and a cached grid
// would show an image as present after it was trashed.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return cmsPageMetadata("Medios");
}

type Props = {
  searchParams: Promise<{ collection?: string | string[] }>;
};

export default async function CmsMediaPage({ searchParams }: Props) {
  const actor = await requireCmsMember("/cms/media");
  const problem = mediaStorageProblem();
  const params = await searchParams;

  if (problem) {
    return (
      <CmsShell actor={actor}>
        <h1 className="mt-0 font-display text-[30px] font-semibold">Medios</h1>
        <p className="font-mono text-[14px] leading-[1.7] text-muted">
          Imágenes de las páginas públicas. Máximo{" "}
          {formatBytes(STORAGE_LIMITS.maxBytes)} por archivo; JPEG, PNG, WebP,
          AVIF y GIF. Quitar una imagen de una página nunca la borra: aparece en
          «ya no se usan», y desde ahí decides.
        </p>
        <p className="mt-6 border border-[var(--vendor-ochre)] px-4 py-3 font-mono text-[13px] leading-[1.7]">
          {problem}
        </p>
      </CmsShell>
    );
  }

  const collections = await cmsMediaService.listCollections();
  const initialView = mediaLibraryViewFromParam(params.collection, collections);
  const [assets, counts] = await Promise.all([
    cmsMediaService.list(mediaLibraryFilter(initialView)),
    cmsMediaService.counts(),
  ]);

  return (
    <CmsShell actor={actor}>
      <h1 className="mt-0 font-display text-[30px] font-semibold">Medios</h1>
      <p className="font-mono text-[14px] leading-[1.7] text-muted">
        Imágenes de las páginas públicas. Máximo{" "}
        {formatBytes(STORAGE_LIMITS.maxBytes)} por archivo; JPEG, PNG, WebP,
        AVIF y GIF. Quitar una imagen de una página nunca la borra: aparece en
        «ya no se usan», y desde ahí decides.
      </p>

      <div className="mt-8">
        <MediaLibrary
          initial={assets}
          initialView={initialView}
          collections={collections}
          counts={counts}
          graceDays={STORAGE_LIMITS.trashGraceDays}
          maxBytes={STORAGE_LIMITS.maxBytes}
        />
      </div>
    </CmsShell>
  );
}
