import type { Metadata } from "next";
import { CategoryHub } from "@/components/categories/CategoryHub";
import {
  categoryBySlug,
  nonEmptyContentCategories,
} from "@/content-system/repository/categories";
import { contentCategoryMetadata } from "@/i18n/metadata";
import { spanishOnly } from "@/i18n/routing";

// One service, e.g. /proveedores/categoria/gas: every company that sells it,
// whether or not it is the company's main one.
export const dynamicParams = true;

export function generateStaticParams() {
  return spanishOnly(async () =>
    (await nonEmptyContentCategories("proveedores")).map((category) => ({
      categoria: category.slug,
    })),
  );
}

type Props = { params: Promise<{ categoria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoria } = await params;
  const category = await categoryBySlug("proveedores", categoria);
  return category
    ? contentCategoryMetadata({
        section: "proveedores",
        slug: category.slug,
        title: category.title,
        description: category.description,
      })
    : {};
}

export default async function ProveedoresCategoryPage({ params }: Props) {
  const { categoria } = await params;
  return <CategoryHub section="proveedores" slug={categoria} />;
}
