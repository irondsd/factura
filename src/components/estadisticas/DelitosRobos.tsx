import { DataFigure } from "@/components/figures/DataFigure";
import { DataTable } from "@/components/figures/DataTable";
import {
  FIRST_YEAR,
  formatCount,
  formatShare,
  LAST_YEAR,
  robos,
  SOURCE,
} from "@/content/estadisticas/data/delitos-caba";

// How a robbery happens, which is the only thing in this dataset that isn't
// about where or when.
//
// The source flags two things on each record beyond the offence type: whether a
// firearm was involved and whether a motorcycle was. That second flag is the
// reason this figure exists — the motochorro is the most-discussed crime in
// Buenos Aires, and this is the only public count of how often a motorcycle
// actually shows up in a robbery report.
//
// A table rather than a chart, deliberately. Both series are shares in a narrow
// band, drawn they would be two slow curves nobody can read a level off, and the
// years either side of the pandemic are exactly the ones a reader wants exact
// rather than eyeballed. Ten rows is short enough to print whole, which also
// means no row has to be dropped and explained.

export function DelitosRobos() {
  const rows = robos();
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <DataFigure
      header={{
        title: <>Cómo se roba en la Ciudad: moto y arma</>,
        subtitle: (
          <>
            En {last.year} aparece una moto en el{" "}
            <span className="text-ink">{formatShare(last.shareMoto)}</span> de
            los robos registrados y un arma en el{" "}
            <span className="text-ink">{formatShare(last.shareArma)}</span> · en{" "}
            {first.year} eran {formatShare(first.shareMoto)} y{" "}
            {formatShare(first.shareArma)}
          </>
        ),
      }}
      caption={
        <>
          Qué proporción de los robos registrados en la Ciudad involucró una
          moto y cuál un arma, año por año desde {FIRST_YEAR}. Las dos columnas
          se leen contra la primera, que es cuántos robos hubo: una proporción
          puede caer porque el fenómeno se achicó o porque el denominador
          creció.
        </>
      }
      note={
        <>
          Son proporciones sobre los robos, no sobre el total de delitos: el
          hurto —sin violencia— no lleva ninguna de las dos marcas. Que un hecho
          quede registrado con moto o con arma depende de lo que consta en la
          denuncia, así que estas cifras son un piso y no un recuento. Fuente:{" "}
          {SOURCE}, datos hasta {LAST_YEAR}.
        </>
      }
    >
      <div className="overflow-x-auto">
        <DataTable
          rows={rows}
          rowKey={(r) => String(r.year)}
          columns={[
            {
              header: "Año",
              cellClassName: "text-ink tabular-nums",
              cell: (r) => r.year,
            },
            {
              header: "Robos",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink/90",
              cell: (r) => formatCount(r.count),
            },
            {
              header: "Con moto",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink",
              cell: (r) => formatShare(r.shareMoto),
            },
            {
              header: "Con arma",
              headClassName: "pl-3",
              numeric: true,
              cellClassName: "pl-3 text-ink",
              cell: (r) => formatShare(r.shareArma),
            },
          ]}
        />
      </div>
    </DataFigure>
  );
}
