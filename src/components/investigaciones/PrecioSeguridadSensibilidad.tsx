import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  DEFAULT_CATEGORY,
  DEFAULT_SIZE,
  PRIORITIES,
  sensitivity,
  SIZES,
} from "@/content/investigaciones/data/alquiler-seguridad";

// The figure that decides whether the rest of the page is worth anything.
//
// A combined index rests on choices nobody can check from the outside — which
// flat, which crimes, how much each half counts — so the only honest thing to do
// is change them and publish what happens. Six recomputations of the same
// ranking, and the names that survive all of them are the answer the page can
// actually stand behind.
//
// The sample changes with the column, which is the trap this table has to name
// rather than hide: three-ambiente rents are published for far fewer barrios, so
// a name can vanish from a column by not being priced rather than by scoring
// badly. The `n` under each row is what makes that visible.

const DEFAULT_SIZE_LABEL = SIZES.find((s) => s.id === DEFAULT_SIZE)!.short;

export function PrecioSeguridadSensibilidad() {
  const balanced = PRIORITIES.find((p) => p.id === "equilibrado")!;
  const { combinations, consensus } = sensitivity("barrios", balanced.weight);

  return (
    <DataFigure
      header={{
        title: <>¿Cambia la respuesta si cambian los supuestos?</>,
        subtitle: (
          <>
            Los cinco mejores barrios, recalculados con cada tamaño de
            departamento y cada recorte de delitos ·{" "}
            {balanced.label.toLowerCase()}
          </>
        ),
      }}
      caption={
        <>
          {consensus.length > 0 ? (
            <>
              {consensus.length === 1 ? "Sobrevive" : "Sobreviven"} a las seis
              combinaciones:{" "}
              <strong className="font-medium text-ink">
                {consensus.map((r) => r.label).join(", ")}
              </strong>
              . Eso es lo más parecido a una respuesta que este cruce puede dar,
              porque no depende de ninguno de los supuestos que se pueden
              discutir. El resto de los nombres entra y sale según qué
              departamento se busque y qué se cuente como delito, y esa
              inestabilidad también es información: significa que entre el
              tercero y el décimo puesto la diferencia es más chica que el ruido
              de los supuestos.
            </>
          ) : (
            <>
              Ningún barrio aparece en las seis combinaciones, y eso es un
              resultado: el orden depende bastante de qué departamento se busque
              y de qué se cuente como delito, así que conviene mirar la fila que
              se parezca a lo que uno está buscando y no el promedio de todas.
            </>
          )}
        </>
      }
      note={
        <>
          La fila de {DEFAULT_SIZE_LABEL} con todos los delitos es la que usan
          el mapa y la tabla de esta página. Las columnas no se comparan entre
          sí de a pares: cada tamaño tiene su propia cobertura, así que un
          barrio puede faltar en la fila de tres ambientes simplemente porque no
          se publicó un alquiler para él, no porque haya bajado en el ranking.
          «Personas» son lesiones dolosas, amenazas y homicidios, el recorte que
          menos depende de cuánta gente circula por un barrio sin vivir ahí.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={combinations}
          rowKey={(c) => `${c.size}-${c.category}`}
          columns={[
            {
              header: "Departamento",
              cellClassName: "whitespace-nowrap",
              cell: (c) => (
                <>
                  <span
                    className={
                      c.size === DEFAULT_SIZE ? "text-ink" : "text-ink/90"
                    }
                  >
                    {c.sizeLabel}
                  </span>
                  <span className="block text-muted tabular-nums">
                    {c.n} barrios
                  </span>
                </>
              ),
            },
            {
              header: "Delitos",
              cellClassName: "whitespace-nowrap",
              cell: (c) => (
                <span
                  className={
                    c.category === DEFAULT_CATEGORY ? "text-ink" : "text-ink/90"
                  }
                >
                  {c.categoryLabel}
                </span>
              ),
            },
            {
              header: "Los cinco mejores, en orden",
              cellClassName: "text-ink/90",
              cell: (c) => c.top.map((r) => r.label).join(" · "),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}
