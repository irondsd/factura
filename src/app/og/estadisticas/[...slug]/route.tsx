import { cardParams, sectionCard } from "@/components/section/card";
import { estadisticas } from "@/content/sections";

// /og/estadisticas/<path>/card.png — the social card. The picture and the
// reasoning behind the route's shape live in `components/section/card.tsx`,
// shared with /investigacion.

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return cardParams(estadisticas);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return sectionCard(estadisticas, slug);
}
