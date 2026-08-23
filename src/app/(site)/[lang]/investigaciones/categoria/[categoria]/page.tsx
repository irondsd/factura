import type { Metadata } from "next";
import { CategoryHub } from "@/components/categories/CategoryHub";
import {
  categoryBySlug,
  nonEmptyContentCategories,
} from "@/content-system/repository/categories";
import { contentCategoryMetadata } from "@/i18n/metadata";

export const dynamicParams = true;

export async function generateStaticParams() {
  return (await nonEmptyContentCategories("investigaciones")).map(
    (category) => ({ categoria: category.slug }),
  );
}

type Props = { params: Promise<{ categoria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoria } = await params;
  const category = await categoryBySlug("investigaciones", categoria);
  return category
    ? contentCategoryMetadata({
        section: "investigaciones",
        slug: category.slug,
        title: category.title,
        description: category.description,
      })
    : {};
}

export default async function InvestigacionesCategoryPage({ params }: Props) {
  const { categoria } = await params;
  return <CategoryHub section="investigaciones" slug={categoria} />;
}
