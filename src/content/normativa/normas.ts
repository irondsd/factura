// The registry behind /normativa: the laws, decrees and codes that produce the
// lines on an Argentine household's bills and contracts.
//
// Editorial rules, because this page ages differently from the rest of the site:
//
// 1. `estado` is the point. A list of law numbers with no status is worse than
//    no list — the Ley de Alquileres, the DNU that made internet a public
//    service and the old subsidy segmentation are all gone, and readers still
//    quote them. Anything not `vigente` MUST carry `estadoNota` saying what
//    replaced it (the test enforces this).
// 2. `fuente` points at the official text and nothing else. Order of preference:
//    argentina.gob.ar/normativa (canonical, carries "texto actualizado") →
//    cedom.gob.ar for CABA. Note the CABA host: `www.cedom.gob.ar/legislacion/
//    normas/leyes/RepoLeyes/leyNNN.html`, NOT the retired `www2.cedom.gob.ar/es/
//    legislacion/...` path that most sites still link — that one 404s.
// 3. `dondeAparece` is what this page has that a lawyer's link list doesn't: the
//    line on the actual bill. Fill it only when it's literally true; an invented
//    one is worse than an empty field.
//
// Deliberately NOT `server-only`: the sitemap, the structured data and
// `normas.test.ts` all import it.

/** The six sections, in display order. Editorial ordering, not alphabetical. */
export const GRUPOS = [
  {
    id: "alquiler",
    label: "Alquiler y contratos de locación",
    blurb:
      "Desde diciembre de 2023 no hay una ley de alquileres: los contratos nuevos se rigen por el Código Civil y Comercial. Las normas derogadas siguen aquí porque todavía rigen los contratos firmados antes de esa fecha.",
  },
  {
    id: "expensas",
    label: "Propiedad horizontal y expensas",
    blurb:
      "Qué puede cobrar un consorcio, qué tiene que rendir el administrador y de dónde salen los dos renglones más grandes de casi toda liquidación: el sueldo del encargado y las obras obligatorias del edificio.",
  },
  {
    id: "luz",
    label: "Luz",
    blurb:
      "El marco que regula a Edesur y Edenor, el ente que controla los cuadros tarifarios y el recargo nacional que aparece impreso en cada boleta.",
  },
  {
    id: "gas",
    label: "Gas",
    blurb:
      "Gas por red, garrafa y el régimen de zona fría, más la reforma que unifica a los dos entes reguladores de energía.",
  },
  {
    id: "agua-internet",
    label: "Agua, internet y telefonía",
    blurb:
      "AySA y su ente regulador por un lado; por el otro, el marco de internet y telefonía, que pasó de precios regulados a precios libres en 2024.",
  },
  {
    id: "derechos",
    label: "Impuestos, derechos y subsidios",
    blurb:
      "El impuesto que llega a tu casa, lo que puedes reclamar cuando una factura viene mal y el régimen que decide si tu hogar recibe subsidio de luz y gas.",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  blurb: string;
}[];

export type GrupoId = (typeof GRUPOS)[number]["id"];

export type Estado = "vigente" | "modificada" | "derogada";

export type Norma = {
  /** Anchor slug. Lowercase, hyphens, no accents — it's a URL fragment. */
  id: string;
  grupo: GrupoId;
  /** Card headline, as a reader would say it out loud: "Ley 24.240". */
  numero: string;
  /** The norm's own subject line, shortened to something readable. */
  titulo: string;
  /** Two or three sentences. Plain Spanish — no "el presente cuerpo normativo". */
  resumen: string;
  jurisdiccion: "nacional" | "caba";
  estado: Estado;
  /** Required whenever `estado` isn't "vigente": what happened, and since when. */
  estadoNota?: string;
  /** Year of sanction, or a phrase when the norm is re-sanctioned periodically. */
  sancion: string;
  /** Who enforces it, when there is a single answer a reader can call. */
  controla?: string;
  /** Where the reader meets this norm on paper. Only when literally true. */
  dondeAparece?: string;
  /** The official text. */
  fuente: { label: string; href: string };
  /** Slug of the guide that explains this in practice, if one exists. */
  guia?: string;
};

// Annotated rather than `as const satisfies`: the optional fields only exist on
// some entries, and a literal-narrowed array drops them from the element type
// entirely — `n.guia` then fails to compile for every consumer.
export const NORMAS: readonly Norma[] = [
  // ── Alquiler ──────────────────────────────────────────────────────────────
  {
    id: "ccyc-locacion",
    grupo: "alquiler",
    numero: "Código Civil y Comercial",
    titulo: "Locación, artículos 1187 a 1226",
    resumen:
      "Es el régimen que rige hoy cualquier contrato de alquiler nuevo. Fija el plazo mínimo de dos años para vivienda, quién paga las reparaciones y las mejoras, y qué obligaciones tienen inquilino y propietario. Lo que no dice el Código lo acuerdan las partes: desde 2023 el índice de actualización, la frecuencia del ajuste, la moneda y el depósito son libres.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2014",
    dondeAparece:
      "En el contrato: el plazo, el reparto de expensas ordinarias y extraordinarias y las causales de rescisión salen de estos artículos.",
    fuente: {
      label: "Ley 26.994 — Código Civil y Comercial",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975",
    },
    guia: "expensas-en-un-alquiler",
  },
  {
    id: "ley-27551",
    grupo: "alquiler",
    numero: "Ley 27.551",
    titulo: "Ley de Alquileres",
    resumen:
      "La ley de 2020 que fijaba tres años de plazo mínimo, depósito de un mes y un ajuste anual obligatorio por el índice ICL del Banco Central. También creaba el registro de contratos ante AFIP y el Programa Nacional de Alquiler Social.",
    jurisdiccion: "nacional",
    estado: "derogada",
    estadoNota:
      "Derogada por el DNU 70/2023, vigente desde el 29 de diciembre de 2023. Sigue rigiendo los contratos firmados antes de esa fecha, hasta que terminen.",
    sancion: "2020",
    fuente: {
      label: "Ley 27.551 (texto original)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-27551-339378",
    },
  },
  {
    id: "ley-27737",
    grupo: "alquiler",
    numero: "Ley 27.737",
    titulo: "Reforma de la Ley de Alquileres",
    resumen:
      "La reforma de octubre de 2023: bajaba el plazo mínimo a dos años y habilitaba ajustes cada seis meses por un coeficiente distinto. Duró dos meses y medio.",
    jurisdiccion: "nacional",
    estado: "derogada",
    estadoNota:
      "Derogada por el DNU 70/2023, salvo su capítulo III de incentivos fiscales.",
    sancion: "2023",
    fuente: {
      label: "Ley 27.737 (texto original)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-27737-391456",
    },
  },
  {
    id: "decreto-70-2023",
    grupo: "alquiler",
    numero: "DNU 70/2023",
    titulo: "Bases para la reconstrucción de la economía argentina",
    resumen:
      "El decreto de necesidad y urgencia que desreguló buena parte de la economía. Para quien alquila, lo que importa es su artículo 249: derogó la Ley de Alquileres y su reforma, y devolvió los contratos al Código Civil y Comercial. Su capítulo laboral fue frenado por la Justicia, pero el capítulo de locaciones nunca se suspendió.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2023",
    fuente: {
      label: "Decreto 70/2023",
      href: "https://www.argentina.gob.ar/normativa/nacional/decreto-70-2023-395521",
    },
  },
  {
    id: "ley-5859-caba",
    grupo: "alquiler",
    numero: "Ley 5.859 (CABA)",
    titulo: "Quién paga la comisión inmobiliaria",
    resumen:
      "En la Ciudad de Buenos Aires, la comisión por un alquiler de vivienda la paga el propietario, no el inquilino. La inmobiliaria tampoco puede cobrarle al inquilino gastos de administración del alquiler. La Justicia porteña confirmó su constitucionalidad en 2021.",
    jurisdiccion: "caba",
    estado: "vigente",
    sancion: "2017",
    controla: "Dirección General de Defensa y Protección al Consumidor (CABA)",
    dondeAparece:
      "Al firmar: si la inmobiliaria te pasa una comisión a cobrar, en CABA no corresponde.",
    fuente: {
      label: "Ley 5.859 (CEDOM)",
      href: "https://www.cedom.gob.ar/legislacion/normas/leyes/RepoLeyes/ley5859.html",
    },
  },

  // ── Expensas ──────────────────────────────────────────────────────────────
  {
    id: "ccyc-propiedad-horizontal",
    grupo: "expensas",
    numero: "Código Civil y Comercial",
    titulo: "Propiedad horizontal, artículos 2037 a 2072",
    resumen:
      "Define qué es una unidad funcional, qué son las partes comunes y por qué las expensas son una obligación que sigue al departamento y no a la persona. También regula el reglamento de propiedad horizontal, la asamblea, las mayorías y el consejo de propietarios.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2014",
    dondeAparece:
      "En la liquidación: el porcentual con el que se reparte cada gasto sale del reglamento que estos artículos regulan.",
    fuente: {
      label: "Ley 26.994 — Código Civil y Comercial",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975",
    },
    guia: "que-son-las-expensas-en-argentina",
  },
  {
    id: "ley-941-caba",
    grupo: "expensas",
    numero: "Ley 941 (CABA)",
    titulo: "Registro Público de Administradores de Consorcios",
    resumen:
      "Ningún administrador puede ejercer en la Ciudad sin estar inscripto en el Registro Público, ni siquiera gratis. Le exige liquidar las expensas mes a mes con el detalle de cada gasto y su comprobante, y poner a disposición esa documentación. El texto ya incluye sus reformas: leyes 3.254, 3.291, 5.932 y 5.983.",
    jurisdiccion: "caba",
    estado: "vigente",
    sancion: "2002",
    controla: "Registro Público de Administradores (CABA)",
    dondeAparece:
      "En el encabezado de tu liquidación: el número de matrícula del administrador es el del registro que crea esta ley.",
    fuente: {
      label: "Ley 941 (CEDOM)",
      href: "https://www.cedom.gob.ar/legislacion/normas/leyes/RepoLeyes/ley941.html",
    },
    guia: "como-leer-un-recibo-de-expensas",
  },
  {
    id: "ley-12981",
    grupo: "expensas",
    numero: "Ley 12.981",
    titulo: "Estatuto del encargado de casas de renta",
    resumen:
      "El régimen laboral propio de los encargados de edificio: categorías, jornada, vivienda, licencias y estabilidad. El consorcio es el empleador, así que todo lo que este estatuto reconoce termina siendo un gasto común.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1947",
    controla: "Ministerio de Trabajo",
    fuente: {
      label: "Ley 12.981",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-12981-45226",
    },
  },
  {
    id: "cct-589-10",
    grupo: "expensas",
    numero: "CCT 589/10",
    titulo: "Convenio colectivo de encargados de edificio (SUTERH)",
    resumen:
      "El convenio que fija las escalas salariales, los adicionales y las contribuciones del personal de edificios. Es el renglón más grande de casi toda expensa, y la razón por la que las expensas suben cuando se homologa una paritaria y no cuando aumenta la inflación del mes.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2010",
    controla: "SUTERH / FATERyH",
    dondeAparece:
      "En la liquidación, bajo «Sueldos y cargas sociales» o «Gastos de personal».",
    fuente: {
      label: "CCT 589/10 (SUTERH)",
      href: "https://www.suterh.org.ar/convenio-colectivo-de-trabajo-589-10-2/",
    },
    guia: "que-incluyen-las-expensas-de-un-edificio",
  },
  {
    id: "ley-6100-caba",
    grupo: "expensas",
    numero: "Ley 6.100 (CABA)",
    titulo: "Código de la Edificación",
    resumen:
      "El código que reemplazó al de 1944 y absorbió las obligaciones que antes vivían en leyes sueltas: conservación de fachadas y balcones, accesibilidad, ascensores e instalaciones. Son las obras que un consorcio no puede postergar, y de donde salen la mayoría de las expensas extraordinarias.",
    jurisdiccion: "caba",
    estado: "vigente",
    sancion: "2018",
    controla: "Agencia Gubernamental de Control (CABA)",
    dondeAparece:
      "En expensas extraordinarias: «conservación de fachada», «revisión de ascensores», «obra de accesibilidad».",
    fuente: {
      label: "Ley 6.100 (CEDOM)",
      href: "https://www.cedom.gob.ar/legislacion/normas/leyes/RepoLeyes/ley6100.html",
    },
    guia: "expensas-extraordinarias-como-controlarlas",
  },
  {
    id: "ley-5920-caba",
    grupo: "expensas",
    numero: "Ley 5.920 (CABA)",
    titulo: "Sistema de Autoprotección contra incendios",
    resumen:
      "Obliga a los edificios de la Ciudad a tener un plan de evacuación, un responsable designado, simulacros periódicos y los elementos de protección contra incendios al día. Reemplazó a la vieja ordenanza 49.308 de matafuegos.",
    jurisdiccion: "caba",
    estado: "vigente",
    sancion: "2017",
    controla: "Agencia Gubernamental de Control (CABA)",
    dondeAparece:
      "En expensas: «recarga de matafuegos», «simulacro de evacuación», «plan de autoprotección».",
    fuente: {
      label: "Ley 5.920 (CEDOM)",
      href: "https://www.cedom.gob.ar/legislacion/normas/leyes/RepoLeyes/ley5920.html",
    },
  },
  {
    id: "ley-13512",
    grupo: "expensas",
    numero: "Ley 13.512",
    titulo: "Ley de Propiedad Horizontal",
    resumen:
      "La ley de 1948 que inventó la propiedad horizontal en Argentina y bajo la que se escribieron casi todos los reglamentos de consorcio anteriores a 2015. Está derogada, pero aparece citada en el reglamento de tu edificio, y por eso vale saber qué es.",
    jurisdiccion: "nacional",
    estado: "derogada",
    estadoNota:
      "Derogada por el Código Civil y Comercial (Ley 26.994) desde el 1 de agosto de 2015.",
    sancion: "1948",
    fuente: {
      label: "Ley 13.512",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-13512-46362",
    },
  },

  // ── Luz ───────────────────────────────────────────────────────────────────
  {
    id: "ley-24065",
    grupo: "luz",
    numero: "Ley 24.065",
    titulo: "Marco regulatorio de la energía eléctrica",
    resumen:
      "Declara servicio público al transporte y a la distribución de electricidad, y crea el ENRE. De aquí salen las concesiones de Edesur y Edenor, el procedimiento con el que se aprueban los cuadros tarifarios y las obligaciones de calidad que la distribuidora debe cumplir.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1992",
    controla: "ENRE",
    dondeAparece:
      "En la boleta: el cuadro tarifario, el cargo fijo y el cargo variable están aprobados bajo este marco.",
    fuente: {
      label: "Ley 24.065 (texto actualizado)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-24065-464",
    },
    guia: "como-leer-la-factura-de-edesur",
  },
  {
    id: "ley-23681",
    grupo: "luz",
    numero: "Ley 23.681",
    titulo: "Recargo del 6‰ sobre la electricidad",
    resumen:
      "Un recargo del seis por mil sobre el precio de la electricidad que pagan todos los usuarios del país. Lo recauda la Secretaría de Energía y se destina a la empresa de servicios públicos de Santa Cruz. Es la línea que más desconcierta en una boleta de luz porteña, y es exactamente lo que dice ser.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1989",
    controla: "Secretaría de Energía",
    dondeAparece:
      "En tu factura de luz, impreso como «Recargo Ley 23.681» o «Ley 23.681 (6‰)».",
    fuente: {
      label: "Ley 23.681",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-23681-83",
    },
    guia: "como-leer-la-factura-de-edesur",
  },
  {
    id: "ley-27351",
    grupo: "luz",
    numero: "Ley 27.351",
    titulo: "Usuarios electrodependientes por razones de salud",
    resumen:
      "Quien necesita electricidad constante para un equipo médico prescripto tiene derecho a un suministro gratuito y a un servicio de respaldo. La distribuidora debe aplicar un descuento del 100% sobre los cargos fijos y variables, previa inscripción en el registro nacional.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2017",
    controla: "ENRE / Ministerio de Salud",
    dondeAparece:
      "En la boleta del usuario registrado: el total llega en cero, con el descuento discriminado.",
    fuente: {
      label: "Ley 27.351",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-27351-274737",
    },
  },
  {
    id: "ley-210-caba",
    grupo: "luz",
    numero: "Ley 210 (CABA)",
    titulo: "Ente Único Regulador de los Servicios Públicos",
    resumen:
      "Crea el organismo porteño que controla los servicios públicos de la Ciudad y recibe reclamos de vecinos: alumbrado, higiene urbana, subterráneos, estacionamiento y — junto con los entes nacionales — la calidad del suministro eléctrico dentro de CABA.",
    jurisdiccion: "caba",
    estado: "vigente",
    sancion: "1999",
    controla: "Ente Único Regulador de los Servicios Públicos (CABA)",
    fuente: {
      label: "Ley 210 (CEDOM)",
      href: "https://www.cedom.gob.ar/legislacion/normas/leyes/RepoLeyes/ley210.html",
    },
  },

  // ── Gas ───────────────────────────────────────────────────────────────────
  {
    id: "ley-24076",
    grupo: "gas",
    numero: "Ley 24.076",
    titulo: "Marco regulatorio del gas natural",
    resumen:
      "El equivalente de la Ley 24.065 para el gas: declara servicio público al transporte y a la distribución, y crea el ENARGAS. Regula las licencias de Metrogas y las demás distribuidoras, y el modo en que se fijan las tarifas. Su texto ordenado fue aprobado por el Decreto 451/2025.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1992",
    controla: "ENARGAS",
    dondeAparece:
      "En la factura de gas: la categoría (R1, R2, R3…), el cargo fijo y el precio del metro cúbico responden a este marco.",
    fuente: {
      label: "Ley 24.076 (texto actualizado)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-24076-475",
    },
    guia: "como-leer-la-factura-de-metrogas",
  },
  {
    id: "ley-26020",
    grupo: "gas",
    numero: "Ley 26.020",
    titulo: "Régimen regulatorio del gas licuado de petróleo",
    resumen:
      "El marco de la garrafa. Regula el envasado, la distribución y la comercialización del GLP, y encarga al Estado asegurar el abastecimiento a precio razonable de los hogares sin gas por red, que son casi la mitad del país.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2005",
    controla: "Secretaría de Energía / ENARGAS",
    fuente: {
      label: "Ley 26.020 (texto actualizado)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-26020-105181",
    },
    guia: "subsidio-de-garrafa-como-cobrarlo",
  },
  {
    id: "ley-27637",
    grupo: "gas",
    numero: "Ley 27.637",
    titulo: "Régimen de Zona Fría",
    resumen:
      "Amplía y prorroga hasta 2031 el régimen de tarifas diferenciales de gas por red para las regiones frías del país. No depende de los ingresos del hogar: se aplica por dónde vives. Por eso convive con el subsidio SEF sin reemplazarlo.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2021",
    controla: "ENARGAS",
    dondeAparece:
      "En la factura de gas de las localidades alcanzadas, como «Bonificación Zona Fría».",
    fuente: {
      label: "Ley 27.637",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-27637-351761",
    },
    guia: "subsidio-de-gas-como-funciona",
  },
  {
    id: "ley-27742",
    grupo: "gas",
    numero: "Ley 27.742",
    titulo: "Ley Bases: emergencia energética y el nuevo ente",
    resumen:
      "Entre muchas otras cosas, ratificó las derogaciones del DNU 70/2023 y creó el Ente Nacional Regulador del Gas y la Electricidad, que debe fusionar al ENARGAS y al ENRE en un solo organismo. La fusión todavía no se concretó: hasta que el nuevo ente se constituya, cada uno sigue funcionando por separado.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2024",
    controla: "Poder Ejecutivo Nacional",
    fuente: {
      label: "Ley 27.742",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-27742-401266",
    },
  },

  // ── Agua, internet y telefonía ────────────────────────────────────────────
  {
    id: "ley-26221",
    grupo: "agua-internet",
    numero: "Ley 26.221",
    titulo: "Marco regulatorio del agua potable y los desagües cloacales",
    resumen:
      "Regula el servicio de AySA en la Ciudad y 26 partidos del conurbano. Crea el ERAS, que es el ente al que se reclama, y la Agencia de Planificación, que aprueba las obras. Su texto ordenado fue actualizado por el Decreto 805/2025, en el marco de la privatización de AySA.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2007",
    controla: "ERAS",
    dondeAparece:
      "En la factura de AySA: el régimen tarifario, el cargo por servicio medido y el no medido salen de este marco.",
    fuente: {
      label: "Ley 26.221",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-26221-125875",
    },
    guia: "como-leer-la-factura-de-aysa",
  },
  {
    id: "ley-27078",
    grupo: "agua-internet",
    numero: "Ley 27.078",
    titulo: "Argentina Digital",
    resumen:
      "El marco de internet, telefonía y TV paga. Declara de interés público el desarrollo de las telecomunicaciones, regula las licencias y el acceso a las redes, y es la ley bajo la que funciona el ENACOM. Fue modificada dos veces en sentidos opuestos: en 2020 y en 2024.",
    jurisdiccion: "nacional",
    estado: "modificada",
    estadoNota:
      "Vigente, con el texto que le dejó el DNU 302/2024. Los precios de internet y telefonía ya no están regulados.",
    sancion: "2014",
    controla: "ENACOM",
    fuente: {
      label: "Ley 27.078",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-27078-239771",
    },
    guia: "cuanto-aumentaron-internet-y-el-celular",
  },
  {
    id: "decreto-690-2020",
    grupo: "agua-internet",
    numero: "DNU 690/2020",
    titulo: "Internet y telefonía como servicio público esencial",
    resumen:
      "Declaró servicios públicos esenciales en competencia a internet, la telefonía móvil y la TV paga, y le dio al ENACOM la potestad de fijar sus precios. Estuvo largamente suspendido por medidas judiciales y hoy está derogado, así que las tarifas de estos servicios son libres.",
    jurisdiccion: "nacional",
    estado: "derogada",
    estadoNota: "Derogado por el DNU 302/2024, desde el 10 de abril de 2024.",
    sancion: "2020",
    fuente: {
      label: "Decreto 690/2020",
      href: "https://www.argentina.gob.ar/normativa/nacional/decreto-690-2020-341372",
    },
  },
  {
    id: "decreto-302-2024",
    grupo: "agua-internet",
    numero: "DNU 302/2024",
    titulo: "Desregulación de los precios de internet y telefonía",
    resumen:
      "Derogó el DNU 690/2020 y reescribió el artículo 48 de Argentina Digital: cada prestador fija sus propios precios, que solo deben ser «justos y razonables». Es la explicación normativa de por qué el abono de internet y celular subió muy por encima de la inflación desde 2024.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2024",
    controla: "ENACOM",
    dondeAparece:
      "En el aumento de tu abono: no hay tope regulatorio ni aviso previo obligatorio de la autoridad.",
    fuente: {
      label: "Decreto 302/2024",
      href: "https://www.argentina.gob.ar/normativa/nacional/decreto-302-2024-397955",
    },
    guia: "cuanto-aumentaron-internet-y-el-celular",
  },

  // ── Impuestos, derechos y subsidios ───────────────────────────────────────
  {
    id: "art-42-constitucion",
    grupo: "derechos",
    numero: "Artículo 42, Constitución Nacional",
    titulo: "Derechos de usuarios y consumidores",
    resumen:
      "El piso de todo lo demás: consumidores y usuarios tienen derecho a información adecuada y veraz, a la protección de sus intereses económicos y a condiciones de trato equitativo y digno. Obliga además a que las leyes prevean organismos de control y participación de los usuarios en ellos.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1994",
    fuente: {
      label: "Constitución Nacional (Ley 24.430)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-24430-804",
    },
  },
  {
    id: "ley-24240",
    grupo: "derechos",
    numero: "Ley 24.240",
    titulo: "Defensa del Consumidor",
    resumen:
      "Sus artículos 25 a 31 son los que aplican a luz, gas y agua. Obligan a informar el consumo del período y los períodos anteriores, y fijan qué pasa cuando la factura viene mal: si te cobraron de más, tienes derecho a la devolución y a un crédito adicional. Cuando la lectura fue estimada y el consumo supera en un 75% el del mismo período del año anterior, se presume que el error es del prestador.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1993",
    controla: "Defensa del Consumidor",
    dondeAparece:
      "En el reverso de la boleta y en el reclamo: es la ley que invocas cuando un consumo facturado no cierra.",
    fuente: {
      label: "Ley 24.240 (texto actualizado)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-24240-638",
    },
  },
  {
    id: "ley-19511",
    grupo: "derechos",
    numero: "Ley 19.511",
    titulo: "Sistema Métrico Legal Argentino",
    resumen:
      "Es la ley del medidor. Todo instrumento con el que se mide para cobrar — el medidor de luz, el de gas, el de agua — debe estar aprobado y verificado según este régimen. Es lo que respalda el pedido de contraste de un medidor que sospechas que mide de más.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1972",
    controla: "INTI / Secretaría de Comercio",
    dondeAparece:
      "En el medidor: el número de aprobación de modelo y el sello de verificación salen de este régimen.",
    fuente: {
      label: "Ley 19.511 (texto actualizado)",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-19511-48851",
    },
  },
  {
    id: "decreto-943-2025",
    grupo: "derechos",
    numero: "Decreto 943/2025",
    titulo: "Subsidios Energéticos Focalizados (SEF)",
    resumen:
      "Rehízo el esquema de subsidios de luz y gas. Eliminó la segmentación en N1, N2 y N3 y la tarifa social de gas, y dejó una sola categoría: el hogar califica o no. El registro RASE pasó a llamarse ReSEF. El corte principal es de ingresos: hasta tres canastas básicas totales del INDEC.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2025",
    controla: "Secretaría de Energía",
    dondeAparece:
      "En las facturas de luz y gas, como «Bonificación SEF» o la leyenda del nivel de subsidio.",
    fuente: {
      label: "Decreto 943/2025",
      href: "https://www.argentina.gob.ar/normativa/nacional/decreto-943-2025-422016",
    },
    guia: "subsidios-de-luz-y-gas-quien-puede-pedirlos",
  },
  {
    id: "ley-23514",
    grupo: "derechos",
    numero: "Ley 23.514",
    titulo: "Fondo permanente para la ampliación de la red de subterráneos",
    resumen:
      "La ley que aparece impresa en el encabezado de toda boleta de ABL porteña. Creó un fondo para extender la red de subte, financiado en parte con un incremento sobre las contribuciones territoriales — el antepasado directo del ABL que pagas hoy.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "1987",
    dondeAparece:
      "En el encabezado de la boleta de ABL: «Alumbrado, Barrido, Limpieza… Ley 23.514/1987».",
    fuente: {
      label: "Ley 23.514",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-23514-92888",
    },
    guia: "que-es-el-abl-y-el-impuesto-inmobiliario",
  },
  {
    id: "codigo-fiscal-caba",
    grupo: "derechos",
    numero: "Código Fiscal (CABA)",
    titulo: "El Código Fiscal y la Ley Impositiva: cuánto pagas de ABL",
    resumen:
      "Son dos textos que trabajan juntos: el Código Fiscal define los tributos porteños y sus exenciones de forma permanente, y la Ley Impositiva fija cada año las alícuotas y los valores. Es la razón por la que el ABL y la patente cambian todos los eneros sin que cambie ninguna ley de fondo.",
    jurisdiccion: "caba",
    estado: "vigente",
    sancion: "Se sanciona cada año",
    controla: "AGIP",
    dondeAparece:
      "En el monto de la cuota: la valuación fiscal, la alícuota y los descuentos por pago anual salen de aquí.",
    fuente: {
      label: "Ley Impositiva 2026 (CEDOM)",
      href: "https://www.cedom.gob.ar/legislacion/normas/leyes/RepoLeyes/ley6927.html",
    },
    guia: "descuentos-y-beneficios-del-abl-en-caba",
  },
  {
    id: "ley-25326",
    grupo: "derechos",
    numero: "Ley 25.326",
    titulo: "Protección de los Datos Personales",
    resumen:
      "Tus facturas son datos personales. Esta ley te da derecho a saber qué datos tuyos tiene una empresa, a pedir que los corrija y a pedir que los borre, y le impone a quien los guarda el deber de protegerlos. Es también el marco bajo el que Factura trata los tuyos.",
    jurisdiccion: "nacional",
    estado: "vigente",
    sancion: "2000",
    controla: "Agencia de Acceso a la Información Pública",
    fuente: {
      label: "Ley 25.326",
      href: "https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790",
    },
  },
];

/** The norms of one group, in registry order. */
export function normasDeGrupo(grupo: GrupoId): readonly Norma[] {
  return NORMAS.filter((n) => n.grupo === grupo);
}

/** Guide slugs referenced by the registry — what the page needs to look up to
 * render a "Guía: …" link with the guide's real title. */
export const GUIA_SLUGS: readonly string[] = [
  ...new Set(NORMAS.map((n) => n.guia).filter((s): s is string => !!s)),
];
