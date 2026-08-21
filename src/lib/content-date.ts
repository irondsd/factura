const DATE = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
});

const DATE_TIME = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

const DATE_SHORT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** Content timestamps are authored and displayed in Buenos Aires time so a
 * local-evening publication never appears as the following UTC day. */
export const formatContentDate = (iso: string): string =>
  DATE.format(new Date(iso));

export const formatContentDateTime = (iso: string): string =>
  DATE_TIME.format(new Date(iso));

/** "15 ago 2026" — the dateline for a card too narrow for "15 de agosto de
 * 2026". Assembled from the parts rather than formatted directly because
 * es-AR's short form is still "15 de ago de 2026", and the two "de"s are most
 * of the width the short month just bought back. Rendered uppercase by the
 * label styling, not here, so the string stays a date. */
export const formatContentDateShort = (iso: string): string =>
  DATE_SHORT.formatToParts(new Date(iso))
    .filter((part) => part.type !== "literal")
    .map((part) => part.value)
    .join(" ");

const TIME_SHORT = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

/** "29 jun 2026 09:00" — the compact stamp for a table column, where the long
 * form ("29 de junio de 2026 a las 09:00") wraps to two lines and takes the row
 * with it. Date and time are formatted separately because the combined es-AR
 * pattern glues them with " a las ", which is most of the width again. */
export const formatContentDateTimeShort = (iso: string): string => {
  const at = new Date(iso);
  return `${formatContentDateShort(iso)} ${TIME_SHORT.format(at)}`;
};
