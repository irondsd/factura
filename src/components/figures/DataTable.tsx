import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

// The one table the data figures draw.
//
// Extracted from `maps/Mapa.tsx`, which is where the shape was first arrived at
// and is still the most demanding user of it: a hover-linked row, a value
// column that prints muted where the source withheld a figure, and an optional
// third column that appears only when the caller has something to put in it.
// The thirty tables under `estadisticas/` and `investigaciones/` had each grown
// their own copy of the same `<thead>`/`<tbody>` scaffolding, which is how two
// of them ended up with hand-rolled cell classes instead of `fd-th`/`fd-td`,
// one of thirty carried a `<caption>`, and two of thirty put `scope` on their
// headers. Those are one decision here instead of thirty there.
//
// ── Deliberately not a client component, and not a server one ─────────────
// There is no "use client" and there is no `server-only`: this module joins
// whichever graph imports it. `Mapa` is a client component, so its copy is
// client; a statistics table is a server component, so its copy is server and
// ships no JavaScript. A directive either way would force every consumer onto
// one side of a boundary this component has no opinion about.
//
// ── What it does not do ───────────────────────────────────────────────────
// No sorting, no filtering, no pagination. Callers hand it rows in the order
// they want printed — a figure decides what its own reading order means, and a
// column header that could reorder the page would make the prose beneath it
// wrong. Anything that needs interaction is the caller's own client component,
// which is exactly how `Mapa` uses this.

export type DataColumn<Row> = {
  header: ReactNode;
  /** This column holds numbers: right-aligned, lining figures, never wrapped,
   * with the heading right-aligned over them. It is `fd-num` on the cells and
   * `text-right` on the header — the combination every numeric column in the
   * corpus was spelling out by hand, in 44 slightly different orders. */
  numeric?: boolean;
  /** Appended to this column's `<th>`, after `fd-th`. */
  headClassName?: string;
  /** Appended to this column's `<td>`, after `fd-td`. Takes the row so a cell
   * can vary with it — the withheld figures that print muted rather than ink. */
  cellClassName?: string | ((row: Row) => string | false | undefined);
  cell: (row: Row) => ReactNode;
  /** Render this column's cells as `<th scope="row">` rather than `<td>`.
   * For a table whose first column names the thing each row is about, which is
   * what lets a screen reader say the name again on every value it reads out.
   * Styling is unchanged — it still gets `fd-td`. */
  rowHeader?: boolean;
};

/** A labelled run of rows. Each group is its own `<tbody>` introduced by a
 * spanning `<th scope="rowgroup">`, which is the accessible spelling of the
 * two the corpus had grown: the other wrote a plain `<td colSpan>` inside one
 * shared `<tbody>`, so the label read as a cell of data rather than as a
 * heading for the rows beneath it. */
export type DataRowGroup<Row> = {
  key: string;
  label: ReactNode;
  rows: readonly Row[];
};

type Common<Row> = {
  columns: readonly DataColumn<Row>[];
  rowKey: (row: Row) => string;
  /** Anything else the `<tr>` needs — the hover handlers and the highlight
   * class in `Mapa`'s case. A server-rendered table passes nothing, which is
   * what keeps handlers from being smuggled across a boundary that would
   * reject them anyway. */
  rowProps?: (
    row: Row,
  ) => Omit<ComponentPropsWithoutRef<"tr">, "key" | "children">;
  className?: string;
  caption?: ReactNode;
};

/** Grouped and flat are exclusive: a table has labelled runs of rows or it has
 * rows, and `footer` belongs to the flat one — a totals line under grouped
 * bodies would be ambiguous about which group it totals. */
type DataTableProps<Row> = Common<Row> &
  (
    | {
        rows: readonly Row[];
        groups?: never;
        /** A closing `<tr>` the caller writes itself, for a totals line whose
         * cells are emphasised differently from the body's. Deliberately a
         * slot rather than another column model: two tables in the corpus want
         * one, and each wants it to say something different. */
        footer?: ReactNode;
      }
    | { groups: readonly DataRowGroup<Row>[]; rows?: never; footer?: never }
  );

export function DataTable<Row>({
  columns,
  rows,
  groups,
  rowKey,
  rowProps,
  className,
  caption,
  footer,
}: DataTableProps<Row>) {
  const body = (row: Row) => (
    <tr key={rowKey(row)} {...rowProps?.(row)}>
      {columns.map((column, i) => {
        const cellClass = cn(
          "fd-td",
          column.numeric && "fd-num",
          typeof column.cellClassName === "function"
            ? column.cellClassName(row)
            : column.cellClassName,
        );
        return column.rowHeader ? (
          <th key={i} scope="row" className={cellClass}>
            {column.cell(row)}
          </th>
        ) : (
          <td key={i} className={cellClass}>
            {column.cell(row)}
          </td>
        );
      })}
    </tr>
  );

  return (
    <table className={cn("w-full border-collapse", className)}>
      {caption}
      <thead>
        <tr>
          {columns.map((column, i) => (
            <th
              key={i}
              scope="col"
              className={cn(
                "fd-th",
                column.numeric && "text-right",
                column.headClassName,
              )}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      {groups ? (
        groups.map((group) => (
          <tbody key={group.key}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={columns.length}
                className="fd-th text-left pt-5 pb-1 border-b-0"
              >
                {group.label}
              </th>
            </tr>
            {group.rows.map(body)}
          </tbody>
        ))
      ) : (
        <tbody>
          {rows?.map(body)}
          {footer}
        </tbody>
      )}
    </table>
  );
}
