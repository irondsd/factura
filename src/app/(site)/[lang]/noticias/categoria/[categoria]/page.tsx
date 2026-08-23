import type { Metadata } from "next";
import { CategoryHub } from "@/components/categories/CategoryHub";
import {
  categoryBySlug,
  nonEmptyContentCategories,
} from "@/content-system/repository/categories";
import { contentCategoryMetadata } from "@/i18n/metadata";

export const dynamicParams = true;

export async function generateStaticParams() {
  return (await nonEmptyContentCategories("noticias")).map((category) => ({
    categoria: category.slug,
  }));
}

type Props = { params: Promise<{ categoria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoria } = await params;
  const category = await categoryBySlug("noticias", categoria);
  return category
    ? contentCategoryMetadata({
        section: "noticias",
        slug: category.slug,
        title: category.title,
        description: category.description,
      })
    : {};
}

export default async function NoticiasCategoryPage({ params }: Props) {
  const { categoria } = await params;
  return <CategoryHub section="noticias" slug={categoria} />;
}
