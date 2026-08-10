import { REGIONS } from "@/content/estadisticas/data/ipc-vivienda";

// The geography table for the methodology section: which districts INDEC puts
// in each of the regions the dataset covers.
//
// Rendered from the region registry rather than written out in the .mdx, for
// the same reason the charts read their numbers from the data module: the page
// explains a series, and the explanation and the series have to be describing
// the same seven regions. Adding a region to the registry adds a row here and a
// pair of charts to the page, with nothing to keep in sync by hand.

export function RegionesIpc() {
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[14px]">
        <thead>
          <tr>
            <th className="text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4 whitespace-nowrap">
              Región
            </th>
            <th className="text-left font-medium uppercase text-micro tracking-label-wide text-muted border-b border-line py-2 pr-4">
              Qué incluye
            </th>
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((r) => (
            <tr key={r.id}>
              <td className="border-b border-line/60 py-2 pr-4 align-top text-ink whitespace-nowrap">
                {r.label}
              </td>
              <td className="border-b border-line/60 py-2 pr-4 align-top text-ink/90">
                {r.covers}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
