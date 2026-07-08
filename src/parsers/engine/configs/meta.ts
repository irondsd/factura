import type { ParserCategory } from "@/parsers/categories";

/** Display metadata for the built-in official parsers. Kept separate from the
 * engine `ParserConfig` (which stays vendor/country-agnostic) — this is the
 * catalog-facing category/region/provider/compat that lands in dedicated
 * `parser_configs` columns at seed time. Keyed by parser slug. */
export type ParserMeta = {
  category: ParserCategory;
  region: string;
  provider: string;
  compat: string;
};

export const OFFICIAL_PARSER_META: Record<string, ParserMeta> = {
  edesur: {
    category: "electricity",
    region: "AR · CABA/GBA Sur",
    provider: "Edesur S.A.",
    compat: "Edesur e-factura PDF",
  },
  metrogas: {
    category: "gas",
    region: "AR · CABA/GBA Sur",
    provider: "MetroGAS S.A.",
    compat: "MetroGAS factura PDF",
  },
  telecom: {
    category: "internet",
    region: "AR · Nacional",
    provider: "Telecom Argentina",
    compat: "Telecom/Fibertel factura PDF",
  },
  "mda-expensas": {
    category: "expensas",
    region: "AR · CABA",
    provider: "MDA Administraciones",
    compat: "MDA liquidación de expensas PDF",
  },
  "dominijanni-expensas": {
    category: "expensas",
    region: "AR · CABA",
    provider: "Dominijanni Propiedades",
    compat: "Dominijanni liquidación PDF",
  },
};
