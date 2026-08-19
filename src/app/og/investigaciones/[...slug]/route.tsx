import { cardParams, sectionCard } from "@/components/section/card";
import { investigacion } from "@/content/sections";

// /og/investigacion/<path>/card.png — the social card. The picture and the
// reasoning behind the route's shape live in `components/section/card.tsx`,
// shared with /estadisticas.

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return cardParams(investigacion);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return sectionCard(investigacion, slug);
}
