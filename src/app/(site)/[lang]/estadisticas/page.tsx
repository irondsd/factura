import type { Metadata } from "next";
import { SectionIndex } from "@/components/section/SectionIndex";
import { estadisticas } from "@/content/estadisticas/pages";
import { sectionIndexMetadata } from "@/i18n/metadata";

// The /estadisticas index. Everything structural — the breadcrumb, the row
// list, the CollectionPage markup — is `<SectionIndex />`, shared with
// /investigacion. What is here is the copy, which is the only part of an index
// that is the section's own.

const TITLE = "Estadísticas de precios y servicios en Argentina";
const DESCRIPTION =
  "Datos oficiales sobre lo que cuesta mantener un hogar en Argentina: inflación de vivienda, agua, luz y gas por región, en series mensuales actualizadas.";
const INTRO =
  "Series de datos públicos sobre los precios del hogar, ordenadas y graficadas para que se puedan leer de un vistazo. Cada página cita su fuente y se actualiza cuando el organismo publica el dato nuevo.";

export function generateMetadata(): Metadata {
  return sectionIndexMetadata({
    id: estadisticas.id,
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default function EstadisticasIndexPage() {
  return (
    <SectionIndex
      section={estadisticas}
      title={TITLE}
      description={DESCRIPTION}
      intro={INTRO}
      closing={{
        // The pitch this section earns: every page above is somebody else's
        // series, and the account turns your own bills into one.
        title: "La misma cuenta, con tus números",
        body: (
          <>
            Cada página de aquí arriba mide un promedio: de un país, de una
            región, de un barrio. Factura hace lo mismo con lo que pagas tú —
            subes el PDF de tus boletas de luz, gas y agua y se arma tu serie
            mes a mes, en pesos y en dólares, para poner al lado de estas.
          </>
        ),
      }}
    />
  );
}
