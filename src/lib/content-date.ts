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

/** Content timestamps are authored and displayed in Buenos Aires time so a
 * local-evening publication never appears as the following UTC day. */
export const formatContentDate = (iso: string): string =>
  DATE.format(new Date(iso));

export const formatContentDateTime = (iso: string): string =>
  DATE_TIME.format(new Date(iso));
