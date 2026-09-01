import {
  CONTENT_COMPONENT_DEFINITIONS,
  type ContentComponentName,
} from "./definitions";

// One writable example of every registered component.
//
// This is the corpus the render tests use: "every component an author can put
// in a page renders" is only a real claim if the list of components comes from
// the manifest rather than from whoever wrote the test. The `Record` below is
// keyed by `ContentComponentName`, so registering a component without teaching
// this file how to write it does not compile — which is the same guarantee the
// manifest itself gives between definitions and bindings.
//
// Not a test file, and deliberately not React: the CMS component help and the
// MCP tool descriptions are the next callers who will want a canonical example
// of each tag, and they run where React does not.

/** Components whose sample is written by hand because a bare tag is not a
 * usable example of them — they take properties, or they wrap copy. Everything
 * else is a data figure the author writes bare. */
const WRITTEN: Partial<Record<ContentComponentName, string>> = {
  ClosingCta:
    '<ClosingCta title="Título">\n\nCopia de cierre.\n\n</ClosingCta>',
  ProbarCta: '<ProbarCta vendor="Edesur">\n\nCopia.\n\n</ProbarCta>',
  Resumen:
    "<Resumen>\n\nLa respuesta de la página en dos frases.\n\n</Resumen>",
  CtaButton: '<CtaButton href="/demo">Ver la demo</CtaButton>',
  CtaRow: "<CtaRow>\n\n<DemoCta />\n\n<SignupCta />\n\n</CtaRow>",
  InflacionChart: '<InflacionChart chart="luz-y-gas" />',
  IpcViviendaChart: '<IpcViviendaChart region="gba" variacion="mensual" />',
  ResumenRegion: '<ResumenRegion region="gba" />',
  PaginaRelacionada:
    '<PaginaRelacionada href="/estadisticas/alquiler-caba">\n\nPor qué seguir leyendo.\n\n</PaginaRelacionada>',
};

/** A body that uses each registered component, one component per entry. */
export const COMPONENT_SAMPLES = Object.fromEntries(
  (Object.keys(CONTENT_COMPONENT_DEFINITIONS) as ContentComponentName[]).map(
    (name) => [name, WRITTEN[name] ?? `<${name} />`],
  ),
) as Record<ContentComponentName, string>;

/** Components that reach the database when they render, so a test without one
 * has to bind something in their place. Only `PaginaRelacionada`: it takes an
 * href and resolves the target page's own title and summary through the
 * section registry, which is a query. */
export const DATABASE_BACKED_COMPONENTS: readonly ContentComponentName[] = [
  "PaginaRelacionada",
];
