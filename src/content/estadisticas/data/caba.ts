// The geography every CABA statistics page joins on: the 48 barrios and the 15
// comunas of the Ciudad Autónoma de Buenos Aires.
//
// This module exists because three parties name the same 48 places differently
// and all three have to agree for a map to be coloured:
//
//   • the city's own boundary file (`barrios.geojson`, Buenos Aires Data) drops
//     every accent and writes "Paternal", "Monserrat", "Villa Del Parque";
//   • IDECBA's spreadsheets are properly typeset but write "Boca",
//     "Montserrat" and "Vélez Sarsfield" (no accent on the second word);
//   • a URL and a JSON key want plain ASCII.
//
// So `id` is the join key everywhere (data files, map paths, table rows),
// `label` is the only string a reader ever sees, and `aka` lists the other
// spellings a publisher uses, so `findBarrio` can resolve any of them.
//
// Only real differences need an `aka`: accents, case and punctuation are
// already collapsed by `nameKey`, so "Vélez Sársfield" and "Velez Sarsfield"
// resolve to each other with no entry. What needs one is a dropped article
// ("Boca", "Paternal") or a different spelling ("Montserrat").
//
// `comuna` is from the official boundary file, not typed by hand: a barrio
// belongs to exactly one comuna, which is what lets a barrio-level series be
// shown on either map.

type Barrio = {
  /** Join key: ASCII slug of `label`. Stable — changing one silently orphans a
   * column in every data file and a path in the map. */
  id: string;
  /** Display name, with the accents both other sources get wrong. */
  label: string;
  /** The comuna this barrio belongs to. */
  comuna: number;
  /** Other spellings this barrio is published under, beyond accent and case
   * differences. Each is noted with the source that uses it. */
  aka?: readonly string[];
};

/** The 48 barrios, alphabetical by the order IDECBA lists them. */
export const BARRIOS = [
  { id: "agronomia", label: "Agronomía", comuna: 15 },
  { id: "almagro", label: "Almagro", comuna: 5 },
  { id: "balvanera", label: "Balvanera", comuna: 3 },
  { id: "barracas", label: "Barracas", comuna: 4 },
  { id: "belgrano", label: "Belgrano", comuna: 13 },
  // IDECBA drops the article.
  { id: "la-boca", label: "La Boca", comuna: 4, aka: ["Boca"] },
  { id: "boedo", label: "Boedo", comuna: 5 },
  { id: "caballito", label: "Caballito", comuna: 6 },
  { id: "chacarita", label: "Chacarita", comuna: 15 },
  { id: "coghlan", label: "Coghlan", comuna: 12 },
  { id: "colegiales", label: "Colegiales", comuna: 13 },
  { id: "constitucion", label: "Constitución", comuna: 1 },
  { id: "flores", label: "Flores", comuna: 7 },
  { id: "floresta", label: "Floresta", comuna: 10 },
  // The boundary file drops the article; IDECBA keeps it.
  { id: "la-paternal", label: "La Paternal", comuna: 15, aka: ["Paternal"] },
  { id: "liniers", label: "Liniers", comuna: 9 },
  { id: "mataderos", label: "Mataderos", comuna: 9 },
  { id: "monte-castro", label: "Monte Castro", comuna: 10 },
  // IDECBA spells it with a second t; the city's boundary file does not.
  { id: "monserrat", label: "Monserrat", comuna: 1, aka: ["Montserrat"] },
  { id: "nueva-pompeya", label: "Nueva Pompeya", comuna: 4 },
  { id: "nunez", label: "Núñez", comuna: 13 },
  { id: "palermo", label: "Palermo", comuna: 14 },
  { id: "parque-avellaneda", label: "Parque Avellaneda", comuna: 9 },
  { id: "parque-chacabuco", label: "Parque Chacabuco", comuna: 7 },
  { id: "parque-chas", label: "Parque Chas", comuna: 15 },
  { id: "parque-patricios", label: "Parque Patricios", comuna: 4 },
  { id: "puerto-madero", label: "Puerto Madero", comuna: 1 },
  { id: "recoleta", label: "Recoleta", comuna: 2 },
  { id: "retiro", label: "Retiro", comuna: 1 },
  { id: "saavedra", label: "Saavedra", comuna: 12 },
  { id: "san-cristobal", label: "San Cristóbal", comuna: 3 },
  { id: "san-nicolas", label: "San Nicolás", comuna: 1 },
  { id: "san-telmo", label: "San Telmo", comuna: 1 },
  { id: "velez-sarsfield", label: "Vélez Sársfield", comuna: 10 },
  { id: "versalles", label: "Versalles", comuna: 10 },
  { id: "villa-crespo", label: "Villa Crespo", comuna: 15 },
  { id: "villa-del-parque", label: "Villa del Parque", comuna: 11 },
  { id: "villa-devoto", label: "Villa Devoto", comuna: 11 },
  { id: "villa-gral-mitre", label: "Villa Gral. Mitre", comuna: 11 },
  { id: "villa-lugano", label: "Villa Lugano", comuna: 8 },
  { id: "villa-luro", label: "Villa Luro", comuna: 10 },
  { id: "villa-ortuzar", label: "Villa Ortúzar", comuna: 15 },
  { id: "villa-pueyrredon", label: "Villa Pueyrredón", comuna: 12 },
  { id: "villa-real", label: "Villa Real", comuna: 10 },
  { id: "villa-riachuelo", label: "Villa Riachuelo", comuna: 8 },
  { id: "villa-santa-rita", label: "Villa Santa Rita", comuna: 11 },
  { id: "villa-soldati", label: "Villa Soldati", comuna: 8 },
  { id: "villa-urquiza", label: "Villa Urquiza", comuna: 12 },
] as const satisfies readonly Barrio[];

/** The 15 comunas. Only their numbers: a comuna has no name, and which barrios
 * it groups is derived from `BARRIOS` by `comunaCovers` rather than repeated
 * here, so the two can't drift apart. */
export const COMUNAS = [
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5 },
  { id: 6 },
  { id: 7 },
  { id: 8 },
  { id: 9 },
  { id: 10 },
  { id: 11 },
  { id: 12 },
  { id: 13 },
  { id: 14 },
  { id: 15 },
] as const;

export const COMUNA_IDS: readonly number[] = COMUNAS.map((c) => c.id);

/** "Comuna 7" — comunas have numbers, not names. */
export const comunaLabel = (id: number): string => `Comuna ${id}`;

/** The barrios in a comuna, in registry order. */
const barriosOf = (comuna: number): readonly Barrio[] =>
  BARRIOS.filter((b) => b.comuna === comuna);

/** The barrios in a comuna as one sentence — "Flores, Parque Chacabuco". */
export const comunaCovers = (comuna: number): string =>
  barriosOf(comuna)
    .map((b) => b.label)
    .join(", ");

/** Accent-, case- and punctuation-insensitive key, so "Vélez Sársfield",
 * "Velez Sarsfield" and "VELEZ SARSFIELD" all collapse to one string. The one
 * function that decides whether two spellings are the same place. */
const nameKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const BY_NAME = new Map<string, Barrio>();
// `as const satisfies` narrows each entry to its own literal type, so the ones
// without an `aka` don't carry the property at all — widen to `Barrio` to read
// it rather than making the field mandatory on all 48.
for (const b of BARRIOS as readonly Barrio[]) {
  BY_NAME.set(nameKey(b.label), b);
  for (const alt of b.aka ?? []) BY_NAME.set(nameKey(alt), b);
}

/** Resolve a barrio from however a publisher spelled it. Returns `undefined`
 * rather than guessing: a name we don't recognise means the source changed, and
 * the refresh script has to stop rather than drop a barrio. */
export const findBarrio = (name: string): Barrio | undefined =>
  BY_NAME.get(nameKey(name));
