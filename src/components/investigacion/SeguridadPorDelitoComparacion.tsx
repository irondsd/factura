import {
  comparison,
  CRIME_YEAR,
  formatArs,
  formatRate,
  RENT_PERIOD_LABEL,
} from "@/content/investigacion/data/seguridad-por-delito";

export function SeguridadPorDelitoComparacion() {
  const rows = comparison();
  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-4">
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Los perfiles que el promedio esconde
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          {rows.length} barrios seleccionados por menor tasa total o por liderar
          una categoría · delitos {CRIME_YEAR} · alquiler de dos ambientes del{" "}
          {RENT_PERIOD_LABEL}
        </p>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className="fd-th">Barrio</th>
              <th className="fd-th text-right pl-3">Robos</th>
              <th className="fd-th text-right pl-3">Hurtos</th>
              <th className="fd-th text-right pl-3">Personas</th>
              <th className="fd-th text-right pl-3">Total</th>
              <th className="fd-th text-right pl-3">Alquiler</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="fd-td text-ink">
                  {r.label}
                  <span className="block text-muted">{r.meta}</span>
                </td>
                <td className="fd-td text-right pl-3 tabular-nums">
                  {formatRate(r.robos)}
                </td>
                <td className="fd-td text-right pl-3 tabular-nums">
                  {formatRate(r.hurtos)}
                </td>
                <td className="fd-td text-right pl-3 tabular-nums">
                  {formatRate(r.personas)}
                </td>
                <td className="fd-td text-right pl-3 tabular-nums text-ink">
                  {formatRate(r.total)}
                </td>
                <td className="fd-td text-right pl-3 tabular-nums">
                  {r.rentMonthly === null
                    ? "Sin dato"
                    : formatArs(r.rentMonthly)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Cada tasa es anual y usa el mismo denominador. El alquiler es un precio
        pedido promedio, no un contrato firmado; «Sin dato» significa que IDECBA
        no publicó un promedio barrial por poca oferta.
      </p>
    </figure>
  );
}
