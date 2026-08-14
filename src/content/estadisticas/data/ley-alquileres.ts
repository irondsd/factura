// The two dates the rental-supply and rentability pages draw on their time
// axes, with the norm each one comes from.
//
// Not a series — four fields and no numbers to refresh — but it lives beside
// the series for one reason: **every figure that marks these dates has to mark
// the same ones.** A page that drew the law entering into force one quarter
// earlier than the page beside it would be inviting the reader to notice a
// difference that isn't in either dataset.
//
// ── Dates, not explanations ────────────────────────────────────────────────
// A vertical rule on a chart says "this happened here". It does not say the
// series moved because of it, and none of these datasets can settle that: the
// pandemic sits inside the same window, the decline starts years before the
// first date, and the recovery has a falling dollar price of housing in it as
// well as a change of law. The pages argue about cause in prose, where the
// argument can be qualified; the charts only line the series up against the
// calendar. Keep the labels here as bare as they are.
//
// ── Where these dates come from ────────────────────────────────────────────
// Both were read off the Boletín Oficial rather than off the press coverage,
// and the `href` on each is the notice itself. The distinction that matters and
// that secondary sources routinely blur is **publication versus entry into
// force**, and the two norms differ on it:
//
//   • Ley 27.551 was published on 30 June 2020 and its own text set it running
//     the following day, so contracts signed from 1 July 2020 were under it.
//   • Decreto 70/2023 was published on 21 December 2023 and set no date of its
//     own, so the Código Civil y Comercial's default applied — the eighth day
//     after publication, 29 December 2023.
//
// `at` below is the date the norm started to bind, not the date it appeared,
// because that is the one a supply series could have reacted to.

export type Evento = {
  id: string;
  /** The chart label. Two words where two will do — see the header. */
  label: string;
  /** ISO date the norm began to apply. */
  at: string;
  /** How the page names it in prose and in the sources block. */
  norma: string;
  href: string;
};

export const EVENTOS: readonly Evento[] = [
  {
    id: "ley",
    label: "Ley de Alquileres",
    at: "2020-07-01",
    norma: "Ley 27.551",
    href: "https://www.boletinoficial.gob.ar/detalleAviso/primera/231429/20200630",
  },
  {
    id: "derogacion",
    label: "Derogación",
    at: "2023-12-29",
    norma: "Decreto 70/2023",
    href: "https://www.boletinoficial.gob.ar/detalleAviso/primera/301122/20231221",
  },
];

/** The month a date falls in, as the monthly series keys them: "2020-07". */
export const eventoMonth = (e: Evento): string => e.at.slice(0, 7);

/** The quarter a date falls in, as the quarterly series keys them: "2023Q4". */
export const eventoQuarter = (e: Evento): string => {
  const [year, month] = e.at.split("-");
  return `${year}Q${Math.floor((Number(month) - 1) / 3) + 1}`;
};
