// The geography every Provincia de Buenos Aires page joins on: the 135
// partidos, and the 26 of them that make up the Gran Buenos Aires the property
// portals actually report on.
//
// The CABA twin of this module (`caba.ts`) exists because three parties spell
// the same 48 barrios three ways. Here the spread is narrower — the province's
// own boundary file is properly typeset, and so is Zonaprop's — but the join
// still needs a stable key, because the sources disagree on case ("JOSÉ C PAZ"
// in a report table, "José C. Paz" in the boundary file) and on the dot after
// an initial. `nameKey` collapses accents, case and punctuation, so most of
// that costs nothing; `aka` is only for a genuinely different spelling.
//
// ── The two groupings, and why `report` is not `zona` ──────────────────────
// Two different cuts of the same 27 partidos live here and they are not the
// same cut:
//
//   • `zona` is the one a reader uses. Norte, Oeste and Sur are how everyone in
//     Buenos Aires describes where they live, and it is what the page groups
//     its table by. It never changes.
//   • `report` is which of Zonaprop's monthly PDFs publishes the partido's
//     figure. It exists because each report also publishes its own *aggregate*
//     index, and an aggregate can only be quoted against the partidos it was
//     computed over — so the composition of a report is data, not trivia.
//
// They disagree in one place, and it is load-bearing: Zonaprop files **General
// San Martín** under GBA Norte, while a reader would call it oeste. Following
// the source for `report` and the reader for `zona` is the only way both the
// aggregate and the table stay true. Tres de Febrero is the mirror case —
// Zonaprop puts it in the Oeste report, and so does everyday usage.
//
// `report` is the *current* structure. It has already changed once: until
// 2026-01 there were two reports, and oeste and sur shared one called "GBA
// Oeste y Sur"; from 2026-03 there are three, and the old aggregate is not
// continuous with either successor. The fetcher owns that history — see
// `scripts/fetch-pba-inmobiliario.ts` — because it is about periods, and
// nothing in this file is.
//
// ── Why 27 and not 24 ─────────────────────────────────────────────────────
// The Gran Buenos Aires is conventionally 24 partidos. Zonaprop's Norte report
// adds Escobar and Pilar, third-cordón rather than conurbano proper but where a
// lot of the northern market is, and its Sur report added La Plata in 2026-03,
// which is not Gran Buenos Aires at all. `PRICED` is therefore "the partidos a
// portal publishes a price for", not an administrative fact, and it grows when
// they add one. `isConurbano24` marks the official set for anything that needs
// it.

type Partido = {
  /** Join key: ASCII slug of `label`. Stable — changing one silently orphans a
   * column in every data file and a path in the map. */
  id: string;
  /** Display name, accents and all. */
  label: string;
  /** Where a reader would say it is. Absent for the interior. */
  zona?: ZonaId;
  /** Which Zonaprop monthly report publishes it. Absent for the interior. */
  report?: ReportId;
  /** One of the 24 partidos of the Gran Buenos Aires proper. Escobar and Pilar
   * have a `zona` and a `report` but are not in the 24. */
  isConurbano24?: true;
  /** Other spellings a publisher uses, beyond accent, case and punctuation
   * differences, which `nameKey` already collapses. */
  aka?: readonly string[];
};

export type ZonaId = "norte" | "oeste" | "sur";
export type ReportId = "norte" | "oeste" | "sur";

/** The three zonas of the Gran Buenos Aires, in the order the pages list them:
 * dearest first, which is also north to south. */
export const ZONAS = [
  {
    id: "norte",
    label: "Zona Norte",
    /** Used in a sentence: "los partidos {inTitle}". */
    inTitle: "del norte",
  },
  { id: "oeste", label: "Zona Oeste", inTitle: "del oeste" },
  { id: "sur", label: "Zona Sur", inTitle: "del sur" },
] as const satisfies readonly { id: ZonaId; label: string; inTitle: string }[];

export const ZONA_IDS: readonly ZonaId[] = ZONAS.map((z) => z.id);

/**
 * The 135 partidos, alphabetical — the order the province's own boundary file
 * lists them, which is also the order `bun run data:pba-geo` writes its paths
 * in, so a diff of the geometry reads against this list.
 *
 * The list is generated from `limite-partidos-pba.geojson` rather than typed:
 * see `scripts/build-pba-geo.ts`, which fails the build if the boundary file
 * ever carries a partido this list doesn't have.
 */
export const PARTIDOS = [
  { id: "adolfo-alsina", label: "Adolfo Alsina" },
  { id: "adolfo-gonzales-chaves", label: "Adolfo Gonzales Chaves" },
  { id: "alberti", label: "Alberti" },
  {
    id: "almirante-brown",
    label: "Almirante Brown",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "arrecifes", label: "Arrecifes" },
  {
    id: "avellaneda",
    label: "Avellaneda",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "ayacucho", label: "Ayacucho" },
  { id: "azul", label: "Azul" },
  { id: "bahia-blanca", label: "Bahía Blanca" },
  { id: "balcarce", label: "Balcarce" },
  { id: "baradero", label: "Baradero" },
  { id: "benito-juarez", label: "Benito Juárez" },
  {
    id: "berazategui",
    label: "Berazategui",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "berisso", label: "Berisso" },
  { id: "bolivar", label: "Bolívar" },
  { id: "bragado", label: "Bragado" },
  { id: "brandsen", label: "Brandsen" },
  { id: "campana", label: "Campana" },
  { id: "canuelas", label: "Cañuelas" },
  { id: "capitan-sarmiento", label: "Capitán Sarmiento" },
  { id: "carlos-casares", label: "Carlos Casares" },
  { id: "carlos-tejedor", label: "Carlos Tejedor" },
  { id: "carmen-de-areco", label: "Carmen de Areco" },
  { id: "castelli", label: "Castelli" },
  { id: "chacabuco", label: "Chacabuco" },
  { id: "chascomus", label: "Chascomús" },
  { id: "chivilcoy", label: "Chivilcoy" },
  { id: "colon", label: "Colón" },
  { id: "coronel-dorrego", label: "Coronel Dorrego" },
  { id: "coronel-pringles", label: "Coronel Pringles" },
  { id: "coronel-rosales", label: "Coronel Rosales" },
  { id: "coronel-suarez", label: "Coronel Suárez" },
  { id: "daireaux", label: "Daireaux" },
  { id: "dolores", label: "Dolores" },
  { id: "ensenada", label: "Ensenada" },
  // Third cordón, not one of the 24, but Zonaprop prices it with the north.
  { id: "escobar", label: "Escobar", zona: "norte", report: "norte" },
  {
    id: "esteban-echeverria",
    label: "Esteban Echeverría",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "exaltacion-de-la-cruz", label: "Exaltación de la Cruz" },
  {
    id: "ezeiza",
    label: "Ezeiza",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  {
    id: "florencio-varela",
    label: "Florencio Varela",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "florentino-ameghino", label: "Florentino Ameghino" },
  { id: "general-alvarado", label: "General Alvarado" },
  { id: "general-alvear", label: "General Alvear" },
  { id: "general-arenales", label: "General Arenales" },
  { id: "general-belgrano", label: "General Belgrano" },
  { id: "general-guido", label: "General Guido" },
  { id: "general-la-madrid", label: "General La Madrid" },
  { id: "general-las-heras", label: "General Las Heras" },
  { id: "general-lavalle", label: "General Lavalle" },
  { id: "general-madariaga", label: "General Madariaga" },
  { id: "general-paz", label: "General Paz" },
  { id: "general-pinto", label: "General Pinto" },
  // Mar del Plata. The label is the partido, which is what every source uses.
  { id: "general-pueyrredon", label: "General Pueyrredón" },
  { id: "general-rodriguez", label: "General Rodríguez" },
  // A reader calls this oeste; Zonaprop reports it under GBA Norte. See the
  // header — the disagreement is why `zona` and `report` are separate fields.
  {
    id: "general-san-martin",
    label: "General San Martín",
    zona: "oeste",
    report: "norte",
    isConurbano24: true,
    aka: ["San Martín"],
  },
  { id: "general-viamonte", label: "General Viamonte" },
  { id: "general-villegas", label: "General Villegas" },
  { id: "guamini", label: "Guaminí" },
  { id: "hipolito-yrigoyen", label: "Hipólito Yrigoyen" },
  {
    id: "hurlingham",
    label: "Hurlingham",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  {
    id: "ituzaingo",
    label: "Ituzaingó",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  {
    id: "jose-c-paz",
    label: "José C. Paz",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  { id: "junin", label: "Junín" },
  { id: "la-costa", label: "La Costa" },
  {
    id: "la-matanza",
    label: "La Matanza",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  // Not conurbano at all — the provincial capital, its own agglomeration.
  // It is here because Zonaprop's Sur report started publishing it in
  // 2026-03, and it is the only partido outside the Gran Buenos Aires that
  // any portal prices monthly.
  { id: "la-plata", label: "La Plata", zona: "sur", report: "sur" },
  {
    id: "lanus",
    label: "Lanús",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "laprida", label: "Laprida" },
  { id: "las-flores", label: "Las Flores" },
  { id: "leandro-n-alem", label: "Leandro N. Alem" },
  { id: "lezama", label: "Lezama" },
  { id: "lincoln", label: "Lincoln" },
  { id: "loberia", label: "Lobería" },
  { id: "lobos", label: "Lobos" },
  {
    id: "lomas-de-zamora",
    label: "Lomas de Zamora",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "lujan", label: "Luján" },
  { id: "magdalena", label: "Magdalena" },
  { id: "maipu", label: "Maipú" },
  {
    id: "malvinas-argentinas",
    label: "Malvinas Argentinas",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  { id: "mar-chiquita", label: "Mar Chiquita" },
  { id: "marcos-paz", label: "Marcos Paz" },
  { id: "mercedes", label: "Mercedes" },
  {
    id: "merlo",
    label: "Merlo",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  { id: "monte", label: "Monte" },
  { id: "monte-hermoso", label: "Monte Hermoso" },
  {
    id: "moreno",
    label: "Moreno",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  {
    id: "moron",
    label: "Morón",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  { id: "navarro", label: "Navarro" },
  { id: "necochea", label: "Necochea" },
  { id: "nueve-de-julio", label: "Nueve de Julio" },
  { id: "olavarria", label: "Olavarría" },
  { id: "patagones", label: "Patagones" },
  { id: "pehuajo", label: "Pehuajó" },
  { id: "pellegrini", label: "Pellegrini" },
  { id: "pergamino", label: "Pergamino" },
  { id: "pila", label: "Pila" },
  // Third cordón, not one of the 24. See Escobar.
  { id: "pilar", label: "Pilar", zona: "norte", report: "norte" },
  { id: "pinamar", label: "Pinamar" },
  { id: "presidente-peron", label: "Presidente Perón" },
  { id: "puan", label: "Puan" },
  { id: "punta-indio", label: "Punta Indio" },
  {
    id: "quilmes",
    label: "Quilmes",
    zona: "sur",
    report: "sur",
    isConurbano24: true,
  },
  { id: "ramallo", label: "Ramallo" },
  { id: "rauch", label: "Rauch" },
  { id: "rivadavia", label: "Rivadavia" },
  { id: "rojas", label: "Rojas" },
  { id: "roque-perez", label: "Roque Pérez" },
  { id: "saavedra", label: "Saavedra" },
  { id: "saladillo", label: "Saladillo" },
  { id: "salliquelo", label: "Salliqueló" },
  { id: "salto", label: "Salto" },
  { id: "san-andres-de-giles", label: "San Andrés de Giles" },
  { id: "san-antonio-de-areco", label: "San Antonio de Areco" },
  { id: "san-cayetano", label: "San Cayetano" },
  {
    id: "san-fernando",
    label: "San Fernando",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  {
    id: "san-isidro",
    label: "San Isidro",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  {
    id: "san-miguel",
    label: "San Miguel",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  { id: "san-nicolas", label: "San Nicolás" },
  { id: "san-pedro", label: "San Pedro" },
  { id: "san-vicente", label: "San Vicente" },
  { id: "suipacha", label: "Suipacha" },
  { id: "tandil", label: "Tandil" },
  { id: "tapalque", label: "Tapalqué" },
  {
    id: "tigre",
    label: "Tigre",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  { id: "tordillo", label: "Tordillo" },
  { id: "tornquist", label: "Tornquist" },
  { id: "trenque-lauquen", label: "Trenque Lauquen" },
  { id: "tres-arroyos", label: "Tres Arroyos" },
  {
    id: "tres-de-febrero",
    label: "Tres de Febrero",
    zona: "oeste",
    report: "oeste",
    isConurbano24: true,
  },
  { id: "tres-lomas", label: "Tres Lomas" },
  { id: "veinticinco-de-mayo", label: "Veinticinco de Mayo" },
  {
    id: "vicente-lopez",
    label: "Vicente López",
    zona: "norte",
    report: "norte",
    isConurbano24: true,
  },
  { id: "villa-gesell", label: "Villa Gesell" },
  { id: "villarino", label: "Villarino" },
  { id: "zarate", label: "Zárate" },
] as const satisfies readonly Partido[];

export type PartidoId = (typeof PARTIDOS)[number]["id"];

/** Every partido in the province. */
export const PARTIDO_IDS: readonly string[] = PARTIDOS.map((p) => p.id);

/** The 27 partidos a price is published for, in the order above. This is the
 * set the metro map draws and the set `amba-geo.json` carries paths for.
 *
 * Named for what it is rather than for a region: it is the 24 of the Gran
 * Buenos Aires, plus Escobar and Pilar in the north and La Plata in the south,
 * which is not a territory anybody has a word for. It is defined by Zonaprop's
 * coverage and it grows when they add a partido — La Plata arrived in 2026-03.
 */
export const PRICED: readonly Partido[] = (
  PARTIDOS as readonly Partido[]
).filter((p) => p.zona !== undefined);

export const PRICED_IDS: readonly string[] = PRICED.map((p) => p.id);

/** The 24 partidos of the Gran Buenos Aires proper. Nothing draws this yet; it
 * is here so a page that needs the official set doesn't reinvent it from a
 * comment. */
export const CONURBANO_24: readonly Partido[] = PRICED.filter(
  (p) => p.isConurbano24,
);

/** The partidos of one zona, in list order. */
export const partidosOfZona = (zona: ZonaId): readonly Partido[] =>
  PRICED.filter((p) => p.zona === zona);

/** The partidos in one of Zonaprop's two reports, in list order. Used to check
 * a parsed report against the set it is supposed to contain. */
export const partidosOfReport = (report: ReportId): readonly Partido[] =>
  PRICED.filter((p) => p.report === report);

/** Used in a sentence: "{zonaCovers('norte')}". Derived so it can't drift from
 * the list above. */
export const zonaCovers = (zona: ZonaId): string => {
  const names = partidosOfZona(zona).map((p) => p.label);
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
};

const nameKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const BY_NAME = new Map<string, Partido>();
for (const p of PARTIDOS as readonly Partido[]) {
  BY_NAME.set(nameKey(p.label), p);
  for (const alt of p.aka ?? []) BY_NAME.set(nameKey(alt), p);
}

/** Resolve any published spelling of a partido to its entry. Returns
 * `undefined` rather than throwing: the callers — a PDF parser and a boundary
 * file reader — each want to report the miss with their own context. */
export const findPartido = (name: string): Partido | undefined => {
  const direct = BY_NAME.get(nameKey(name));
  if (direct) return direct;
  // "Islas Tigre", "Islas de Zárate", "Islas San Fernando". The delta and river
  // islands belong to a partido, but two provincial sources file them as
  // separate units of their own — ARBA's boundary file and the OVS land
  // relevamiento, independently. Neither is a place a reader would name, and
  // both mean the partido, so they resolve to it.
  const mainland = name.replace(/^\s*islas\s+(de\s+)?/i, "");
  return mainland === name ? undefined : BY_NAME.get(nameKey(mainland));
};

const BY_ID = new Map((PARTIDOS as readonly Partido[]).map((p) => [p.id, p]));

export const partidoLabel = (id: string): string => BY_ID.get(id)?.label ?? id;
