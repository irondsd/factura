import "server-only";
import { resolveMediaRef } from "@/content-system/media/repository";
import type { ContentMetadata } from "@/content-system/types";
import { Opiniones } from "./Opiniones";
import { ProviderSummary } from "./ProviderSummary";

/** The bindings for the /proveedores components on one page —
 * `<ProviderSummary />` and `<Opiniones />` — for the public route and the CMS
 * preview alike: one function, so the preview cannot draw a different page
 * from the one that will publish.
 *
 * Both are bare tags over metadata. The logo is resolved here, once, before the
 * body renders: its id is in the metadata, not in the body the media pass
 * reads. */
export async function bindProviderComponents(page: {
  title: string;
  metadata: Pick<ContentMetadata, "vendor" | "provider" | "reviews">;
}) {
  const provider = page.metadata.provider ?? {};
  const logo = await resolveMediaRef(provider.logoMediaId);
  const name = page.metadata.vendor?.trim() || page.title;
  return {
    ProviderSummary: function BoundProviderSummary() {
      return <ProviderSummary name={name} value={provider} logo={logo} />;
    },
    Opiniones: function BoundOpiniones() {
      return <Opiniones name={name} value={page.metadata.reviews} />;
    },
  };
}
