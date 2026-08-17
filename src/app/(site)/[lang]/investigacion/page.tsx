import type { Metadata } from "next";
import { SectionIndex } from "@/components/section/SectionIndex";
import { investigacion } from "@/content/investigacion/pages";
import { sectionIndexMetadata } from "@/i18n/metadata";

// The /investigacion index. Everything structural is `<SectionIndex />`, shared
// with /estadisticas; what is here is the copy.
//
// The intro has one job beyond describing the section: telling a reader who
// arrived from /estadisticas why there are two. The answer is that a statistics
// page publishes one series and this one crosses several to answer a question
// none of them answers alone.

const TITLE = "Investigaciones sobre vivienda y costo de vida en Argentina";
const DESCRIPTION =
  "Análisis que cruzan varias series oficiales para responder preguntas concretas sobre dónde vivir en Argentina: precio, seguridad, oferta y servicios, barrio por barrio.";
const INTRO =
  "Una estadística publica una serie; una investigación cruza varias para contestar una pregunta que ninguna contesta sola. Cada página de aquí abajo parte de los datos oficiales que Factura ya publica, explica el método con el que los combina y deja ver el cálculo entero.";

export function generateMetadata(): Metadata {
  return sectionIndexMetadata({
    id: investigacion.id,
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default function InvestigacionIndexPage() {
  return (
    <SectionIndex
      section={investigacion}
      title={TITLE}
      description={DESCRIPTION}
      intro={INTRO}
      closing={{
        // The bridge this section earns: it is about choosing where to live, and
        // the bill arrives after the decision.
        title: "Decidir dónde vivir es la mitad de la cuenta",
        body: (
          <>
            Estas páginas comparan barrios con los datos que hay antes de
            mudarse: lo que se pide de alquiler, lo que se registra en la calle.
            Lo que cuesta vivir ahí llega después, en PDF y de cinco empresas
            distintas. Factura convierte esas boletas en tu propia serie
            mensual, en pesos y en dólares.
          </>
        ),
      }}
    />
  );
}
