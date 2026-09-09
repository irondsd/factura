import { createElement, type ComponentType } from "react";
import { notFound } from "next/navigation";
import { FigureAttribution } from "@/components/figures/FigureAttribution";
import {
  embeddableComponentForSlug,
  type EmbedSection,
} from "@/content-system/components/embeds";
import {
  contentComponentInstances,
  sameLiteralProps,
} from "@/content-system/components/instances";
import { sectionById } from "@/content/sections";

type Props = {
  params: Promise<{
    section: string;
    component: string;
    slug: string[];
  }>;
  searchParams: Promise<{ props?: string | string[] }>;
};

function isEmbedSection(value: string): value is EmbedSection {
  return value === "estadisticas" || value === "investigaciones";
}

function parseProps(value: string | string[] | undefined): unknown {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export default async function EmbeddedFigurePage({
  params,
  searchParams,
}: Props) {
  const { section: sectionId, component: componentSlug, slug } = await params;
  if (!isEmbedSection(sectionId)) notFound();

  const registered = embeddableComponentForSlug(componentSlug);
  if (!registered || !registered.definition.sections.includes(sectionId)) {
    notFound();
  }

  const section = sectionById(sectionId);
  const page = await section.load(slug);
  if (!page) notFound();

  const rawProps = parseProps((await searchParams).props);
  const parsedProps = registered.definition.props.safeParse(rawProps);
  if (!parsedProps.success) notFound();
  const componentProps = parsedProps.data as Record<string, unknown>;

  const appearsInArticle = contentComponentInstances(
    page.document.body,
    registered.name,
  ).some((instance) => sameLiteralProps(instance, componentProps));
  if (!appearsInArticle) notFound();

  const Figure = registered.component as ComponentType<Record<string, unknown>>;
  const sourceHref = section.href(slug);

  return (
    <main className="mx-auto w-full max-w-[820px] p-3 sm:p-5">
      <div className="[&>.fd-card]:my-0 [&>.fd-card]:border-b-0">
        {createElement(Figure, componentProps)}
      </div>
      <FigureAttribution sourceHref={sourceHref} newTab />
    </main>
  );
}
