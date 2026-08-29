import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  DEFAULT_SIZE,
  display,
  formatM2,
  LAST_UPDATED,
  zonas,
} from "@/content/estadisticas/data/oferta-alquiler-caba";

// The city's rental offer in four rows: norte, centro, oeste and sur.
//
// The zones are ours — nobody publishes a boundary for "zona oeste", so this
// groups whole comunas in a way the reader can see and argue with (see `ZONAS`
// in data/caba.ts). But unlike `PrecioPorZona`, which has to spend a paragraph
// defending a median of barrios against IDECBA's listing-weighted average,
// **the arithmetic here needs no defence**: these are totals, so a zone's
// figure is exactly the sum of its barrios', which is the same sum the source
// would compute. Only the grouping is a judgement call.
//
// That is why the column that matters is the share. A supply page's real
// finding is not that one zone has more square metres than another — the zones
// are different sizes — but how lopsided the split is, and a percentage is the
// only way to say that in a number a reader can carry away.

export function OfertaPorZona() {
  const rows = zonas(DEFAULT_SIZE);

  return (
    <DataFigure
      header={{
        title: <>Dónde se concentra la oferta de alquiler</>,
        subtitle: <>Departamentos publicados en alquiler · {LAST_UPDATED}</>,
      }}
      caption={
        <>
          Cómo se reparte por zonas la oferta de departamentos en alquiler de la
          Ciudad de Buenos Aires: cuánto se publica en el norte, en el centro,
          en el oeste y en el sur, qué porcentaje del total representa cada zona
          y cuál es el barrio que más concentra dentro de cada una.
        </>
      }
      note={
        <>
          Las zonas no son geografía oficial: agrupamos comunas enteras. La suma
          sí es exacta —son totales, y el total de una zona es la suma de sus
          barrios—, a diferencia de los promedios de las páginas de precios, que
          no se pueden sumar. La cantidad de departamentos es aproximada: son
          los metros cuadrados avisados divididos por la superficie promedio de
          un aviso del mes. Datos de IDECBA sobre la base de Argenprop, hasta{" "}
          {LAST_UPDATED}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(z) => z.id}
          columns={[
            {
              header: "Zona",
              cellClassName: "align-top",
              cell: (z) => (
                <>
                  <span className="text-ink">{z.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5">
                    {z.comunas}
                  </span>
                </>
              ),
            },
            {
              header: "En oferta",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink align-top",
              cell: (z) => (
                <>
                  {display(z.units)}
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 font-normal">
                    {formatM2(z.m2)}
                  </span>
                </>
              ),
            },
            {
              header: "De la Ciudad",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90 align-top",
              cell: (z) => (
                <>
                  {z.share.toLocaleString("es-AR", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  %
                </>
              ),
            },
            {
              header: "Barrio con más oferta",
              headClassName: "text-right pl-3",
              cellClassName: "text-right pl-3 align-top",
              cell: (z) => (
                <>
                  <span className="block text-ink/90">{z.top.label}</span>
                  <span className="block text-muted text-[11.5px] leading-[1.5] mt-0.5 tabular-nums">
                    {display(z.top.units)}
                  </span>
                </>
              ),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}
