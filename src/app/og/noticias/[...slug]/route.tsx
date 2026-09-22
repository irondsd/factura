import { sectionCard } from "@/components/section/card";
import { noticias } from "@/content/sections";

// /og/noticias/<path>/card.png — the social card. The picture and the
// reasoning behind the route's shape live in `components/section/card.tsx`,
// shared with /estadisticas and /investigaciones.

// Rendered on request and cached by the CDN, never prerendered: see
// `CARD_CACHE_CONTROL` in `components/section/card.tsx`.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return sectionCard(noticias, slug);
}
