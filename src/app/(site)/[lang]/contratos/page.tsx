import { redirect } from "next/navigation";
import { spanishIndexParams } from "@/i18n/routing";
import { contractPath } from "@/lib/rental-contract/model";

export const dynamicParams = false;
export const generateStaticParams = spanishIndexParams;
export default function ContractsPage() {
  redirect(contractPath("vivienda"));
}
