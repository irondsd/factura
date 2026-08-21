import { cardParams, sectionCard } from "@/components/section/card";
import { noticias } from "@/content/sections";

// /og/noticias/<path>/card.png — the social card. The picture and the
// reasoning behind the route's shape live in `components/section/card.tsx`,
// shared with /estadisticas and /investigaciones.

export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateStaticParams() {
  return cardParams(noticias);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return sectionCard(noticias, slug);
}
