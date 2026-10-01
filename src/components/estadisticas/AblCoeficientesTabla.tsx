import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  barrioLabel,
  COEFICIENTES,
  formatCoef,
  formatRango,
  LEY,
  SOURCE,
  type Subzona,
  type ZonaFiscal,
} from "@/content/estadisticas/data/abl-caba";
import { BARRIOS } from "@/content/shared/caba";

// The art. 42 table itself: every barrio and subzona with its coeficiente
// geográfico, grouped by the law's three zones and in the law's own order.
//
// The map can show one colour per barrio; this is where the 19 barrios cut by
// avenues get every row. The boundary text is the law's, abbreviations and
// all — "límite norte" is the barrio's own edge — because it is the only
// definition of a subzona there is, and paraphrasing it would be the one way
// to make the table wrong about a specific block.

const ZONAS: ZonaFiscal[] = ["I", "II", "III"];

export function AblCoeficientesTabla() {
  const groups = ZONAS.map((zona) => {
    const rows = COEFICIENTES.filter((r) => r.zona === zona);
    const cgs = rows.map((r) => r.cg);
    return {
      key: zona,
      label: (
        <>
          Zona {zona} · coeficientes{" "}
          {formatRango(Math.min(...cgs), Math.max(...cgs))}
        </>
      ),
      rows,
    };
  });

  return (
    <DataFigure
      header={{
        title: <>Tabla de coeficientes del ABL por barrio y subzona</>,
        subtitle: (
          <>
            {COEFICIENTES.length} subzonas en {BARRIOS.length} barrios · Ley{" "}
            {LEY.number}, art. 42
          </>
        ),
      }}
      caption={
        <>
          Cada fila es una subzona con su coeficiente geográfico. Donde la
          subzona dice «todo el barrio», el coeficiente es uno solo; en el
          resto, el límite es el que escribe la ley, y «límite norte» o «límite
          sur» es el borde del propio barrio.
        </>
      }
      note={
        <>
          Si una partida queda en más de una subzona, la ley aplica el
          coeficiente mayor. Belgrano, Núñez, Palermo y Recoleta tienen subzonas
          en las zonas II y III, y Flores en las zonas I y II, por eso aparecen
          en dos grupos. Fuente: {SOURCE}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable<Subzona>
          groups={groups}
          rowKey={(r) => `${r.barrio}-${r.zona}-${r.tramo ?? "todo"}`}
          columns={[
            {
              header: "Barrio",
              rowHeader: true,
              cellClassName: "text-left align-top font-normal pr-3",
              cell: (r) => barrioLabel(r.barrio),
            },
            {
              header: "Subzona",
              cellClassName: "text-muted align-top pr-3",
              cell: (r) => r.tramo ?? "Todo el barrio",
            },
            {
              header: "Coeficiente",
              numeric: true,
              cell: (r) => formatCoef(r.cg),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}
