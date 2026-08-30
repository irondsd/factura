import { db } from "@/db";
import { cmsLocationRedirects, cmsLocations } from "@/db/schema";

/** Pre-backfill registry rollout. Re-running it updates the original stage-1
 * records to the reviewed public labels and concise slugs; after rollout,
 * ordinary copy changes belong in the CMS. */
const LOCATIONS = [
  [
    "argentina",
    "argentina",
    "Argentina",
    "Contenido sobre Argentina",
    "Guías, noticias, estadísticas e investigaciones de alcance verdaderamente nacional.",
  ],
  [
    "caba",
    "caba",
    "CABA",
    "Contenido sobre CABA",
    "Información que se aplica a la Ciudad Autónoma de Buenos Aires o analiza sus datos.",
  ],
  [
    "provincia-de-buenos-aires",
    "buenos-aires",
    "Buenos Aires",
    "Contenido sobre Buenos Aires",
    "Información que se aplica a la Provincia de Buenos Aires o analiza sus datos.",
  ],
  [
    "gran-buenos-aires",
    "gba",
    "GBA",
    "Contenido sobre el GBA",
    "Información sobre los partidos y localidades que integran el Gran Buenos Aires.",
  ],
  [
    "cuyo",
    "cuyo",
    "Cuyo",
    "Contenido sobre Cuyo",
    "Información que analiza o se aplica específicamente a la región de Cuyo.",
  ],
  [
    "noreste-argentino",
    "noreste",
    "Noreste",
    "Contenido sobre el Noreste",
    "Información que analiza o se aplica específicamente al Noreste argentino.",
  ],
  [
    "noroeste-argentino",
    "noroeste",
    "Noroeste",
    "Contenido sobre el Noroeste",
    "Información que analiza o se aplica específicamente al Noroeste argentino.",
  ],
  [
    "region-pampeana",
    "pampeana",
    "Pampeana",
    "Contenido sobre la región Pampeana",
    "Información que analiza o se aplica específicamente a la Región Pampeana.",
  ],
  [
    "patagonia",
    "patagonia",
    "Patagonia",
    "Contenido sobre la Patagonia",
    "Información que analiza o se aplica específicamente a la Patagonia argentina.",
  ],
  [
    "neuquen",
    "neuquen",
    "Neuquén",
    "Contenido sobre Neuquén",
    "Información que se aplica a Neuquén o analiza datos de la provincia.",
  ],
  [
    "mendoza",
    "mendoza",
    "Mendoza",
    "Contenido sobre Mendoza",
    "Información que se aplica a Mendoza o analiza datos de la provincia.",
  ],
  [
    "cordoba",
    "cordoba",
    "Córdoba",
    "Contenido sobre Córdoba",
    "Información que se aplica a Córdoba o analiza datos de la provincia.",
  ],
  [
    "santa-fe",
    "santa-fe",
    "Santa Fe",
    "Contenido sobre Santa Fe",
    "Información que se aplica a Santa Fe o analiza datos de la provincia.",
  ],
] as const;

for (const [key, slug, label, title, description] of LOCATIONS) {
  await db.transaction(async (tx) => {
    const [location] = await tx
      .insert(cmsLocations)
      .values({ key, slug, label, title, description })
      .onConflictDoUpdate({
        target: cmsLocations.key,
        set: { slug, label, title, description, updatedAt: new Date() },
      })
      .returning({ id: cmsLocations.id });

    // The stage-1 key was also its public slug. Keep those already-deployed
    // addresses working when this rollout replaces them with shorter slugs.
    if (location && key !== slug) {
      await tx
        .insert(cmsLocationRedirects)
        .values({ fromSlug: key, locationId: location.id })
        .onConflictDoUpdate({
          target: cmsLocationRedirects.fromSlug,
          set: { locationId: location.id },
        });
    }
  });
}

console.log(`[locations] registry ready (${LOCATIONS.length} initial records)`);
process.exit(0);
