import { db } from "@/db";
import { cmsLocations } from "@/db/schema";

/** Initial reviewed registry shape. Inserting is idempotent; later copy changes
 * belong in the CMS so optimistic locking and cache invalidation apply. */
const LOCATIONS = [
  [
    "argentina",
    "Argentina",
    "Contenido sobre Argentina",
    "Guías, noticias, estadísticas e investigaciones de alcance verdaderamente nacional.",
  ],
  [
    "caba",
    "CABA",
    "Contenido sobre CABA",
    "Información que se aplica a la Ciudad Autónoma de Buenos Aires o analiza sus datos.",
  ],
  [
    "provincia-de-buenos-aires",
    "Provincia de Buenos Aires",
    "Contenido sobre la Provincia de Buenos Aires",
    "Información que se aplica a la Provincia de Buenos Aires o analiza sus datos.",
  ],
  [
    "gran-buenos-aires",
    "Gran Buenos Aires",
    "Contenido sobre el Gran Buenos Aires",
    "Información sobre los partidos y localidades que integran el Gran Buenos Aires.",
  ],
  [
    "cuyo",
    "Cuyo",
    "Contenido sobre Cuyo",
    "Información que analiza o se aplica específicamente a la región de Cuyo.",
  ],
  [
    "noreste-argentino",
    "Noreste argentino",
    "Contenido sobre el Noreste argentino",
    "Información que analiza o se aplica específicamente al Noreste argentino.",
  ],
  [
    "noroeste-argentino",
    "Noroeste argentino",
    "Contenido sobre el Noroeste argentino",
    "Información que analiza o se aplica específicamente al Noroeste argentino.",
  ],
  [
    "region-pampeana",
    "Región Pampeana",
    "Contenido sobre la Región Pampeana",
    "Información que analiza o se aplica específicamente a la Región Pampeana.",
  ],
  [
    "patagonia",
    "Patagonia",
    "Contenido sobre la Patagonia",
    "Información que analiza o se aplica específicamente a la Patagonia argentina.",
  ],
  [
    "neuquen",
    "Neuquén",
    "Contenido sobre Neuquén",
    "Información que se aplica a Neuquén o analiza datos de la provincia.",
  ],
  [
    "mendoza",
    "Mendoza",
    "Contenido sobre Mendoza",
    "Información que se aplica a Mendoza o analiza datos de la provincia.",
  ],
  [
    "cordoba",
    "Cordoba",
    "Contenido sobre Córdoba",
    "Información que se aplica a Córdoba o analiza datos de la provincia.",
  ],
  [
    "santa-fe",
    "Santa Fe",
    "Contenido sobre Santa Fe",
    "Información que se aplica a Santa Fe o analiza datos de la provincia.",
  ],
] as const;

await db
  .insert(cmsLocations)
  .values(
    LOCATIONS.map(([key, label, title, description], sortOrder) => ({
      key,
      slug: key,
      label,
      title,
      description,
      sortOrder,
    })),
  )
  .onConflictDoNothing();

console.log(`[locations] registry ready (${LOCATIONS.length} initial records)`);
process.exit(0);
