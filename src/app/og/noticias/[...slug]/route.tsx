import { cardParams, sectionCard } from "@/components/section/card";
import { noticias } from "@/content/sections";
export const dynamic = "force-static";
export const dynamicParams = false;
export async function generateStaticParams() { return cardParams(noticias); }
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) { return sectionCard(noticias, (await params).slug); }
