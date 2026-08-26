import { z } from "zod";
import { chartIdSchema } from "../metadata/guias";
import type { ContentSection } from "../types";
import { SECTION_COMPONENT_NAMES } from "./sectionDefinitions";

// The content component manifest, *without* the components (cms.md).
//
// Split from `./manifest.tsx` deliberately. Grammar validation needs the names,
// the sections, the children rule and the property schemas — and it runs in
// places that must not import React: the CMS validator, the CMS MCP, and the
// importer. Rendering needs the bindings, and gets them from
// `./manifest.tsx`, which merges the two halves back together.
//
// Adding a component means adding it here and to the bindings there; the
// `satisfies` in the manifest will not compile with one but not the other.

/** Whether a component may wrap markdown children. `leaf` components are
 * written self-closing and a body between tags is an error rather than
 * something silently dropped. */
export type ComponentKind = "leaf" | "container";

/** Presentation metadata for source-editor completion. This is deliberately
 * kept beside the component definition: a new component should teach the CMS
 * how to insert and explain itself at the same place that defines its allowed
 * sections and props. These fields never affect rendering or validation. */
export type ComponentAuthoringGroup =
  | "article-structure"
  | "calls-to-action"
  | "charts-summaries"
  | "maps"
  | "tables-comparisons";

export type ComponentAuthoringMetadata = {
  label?: string;
  group?: ComponentAuthoringGroup;
  rank?: number;
  propertyDescriptions?: Readonly<Record<string, string>>;
  propertyPlaceholders?: Readonly<Record<string, string>>;
  /** Optional properties that are useful enough to include in a new snippet. */
  defaultProps?: Readonly<Record<string, string | boolean>>;
  childPlaceholder?: string;
  notes?: readonly string[];
  /** A complete CodeMirror snippet, for components whose default shape is
   * more useful than the generic leaf/container template. */
  template?: string;
};

export type ContentComponentDefinition = {
  sections: readonly ContentSection[];
  kind: ComponentKind;
  /** Validates the literal attributes written in the MDX. Always `.strict()`:
   * an unknown property is a typo that would otherwise render nothing. */
  props: z.ZodType;
  /** Shown in the CMS component help and used in the MCP tool instructions. */
  description: string;
  authoring?: ComponentAuthoringMetadata;
};

const noProps = z.object({}).strict();

/** Components whose props the *article route* binds, not the author. The MDX
 * writes a bare tag and the page supplies the data — `useMDXComponents()` takes
 * no arguments, so there is no other way for a component to know which article
 * it is in. Any attribute written on one of these is a mistake. */
const CONTEXT_BOUND = noProps;

const DATA_SECTIONS = [
  "estadisticas",
  "investigaciones",
] as const satisfies readonly ContentSection[];
const DATA_LEAF_COMPONENTS = Object.fromEntries(
  SECTION_COMPONENT_NAMES.filter(
    (name) =>
      ![
        "ClosingCta",
        "PaginaRelacionada",
        "IpcViviendaChart",
        "ResumenRegion",
      ].includes(name),
  ).map((name) => [
    name,
    {
      sections: DATA_SECTIONS,
      kind: "leaf" as const,
      props: noProps,
      description:
        "Registered statistics/research visualization or data table.",
    },
  ]),
) as Record<string, ContentComponentDefinition>;

export const CONTENT_COMPONENT_DEFINITIONS = {
  // ── guides ────────────────────────────────────────────────────────────────
  ClosingCta: {
    sections: ["guias", "noticias", "estadisticas", "investigaciones"],
    kind: "container",
    props: z
      .object({
        title: z.string().min(1).optional(),
      })
      .strict(),
    description:
      "Closing call to action. Give it a guide-specific `title` and two sentences of body copy; without them it falls back to generic wording.",
    authoring: {
      label: "Cierre con CTA",
      group: "article-structure",
      rank: 60,
      defaultProps: { title: "Título específico" },
      childPlaceholder: "Dos frases relacionadas con esta página.",
      notes: [
        "Incluye un título y copy específicos de la página; el bloque también añade sus botones.",
      ],
    },
  },
  ProbarCta: {
    sections: ["guias"],
    kind: "container",
    props: z
      .object({
        vendor: z.string().min(1).optional(),
        noun: z.string().min(1).optional(),
      })
      .strict(),
    description:
      'Mid-article prompt to drop a bill, for the reader who has the document open. `vendor` names the issuer; `noun` is what that document is called ("boleta", "liquidación") and defaults to "factura".',
    authoring: {
      label: "Invitación a probar",
      group: "calls-to-action",
      rank: 10,
      childPlaceholder: "Texto breve para invitar a probar la app.",
    },
  },
  CtaButton: {
    sections: ["guias"],
    kind: "container",
    props: z
      .object({
        href: z
          .string()
          .min(1)
          // Content may link into this site or out of it, but a `javascript:`
          // or `data:` href is a script delivered through an attribute — the
          // one place a link is not just a link.
          .refine(
            (h) => /^(https?:\/\/|\/|#|mailto:)/.test(h),
            "must be a site path, an http(s) URL, an anchor or a mailto: link",
          ),
        variant: z.enum(["solid", "invert"]).optional(),
        newTab: z.boolean().optional(),
      })
      .strict(),
    description: "A single call-to-action button.",
    authoring: {
      label: "Botón CTA",
      group: "calls-to-action",
      rank: 20,
      propertyDescriptions: {
        href: "Ruta del sitio, URL https, ancla o enlace mailto.",
        variant: "Aspecto del botón.",
        newTab: "Abre el enlace en una pestaña nueva.",
      },
      propertyPlaceholders: { href: "/demo" },
      childPlaceholder: "Texto del botón",
    },
  },
  CtaRow: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Places a couple of CTA buttons side by side.",
    authoring: {
      label: "Fila de botones",
      group: "calls-to-action",
      rank: 30,
      childPlaceholder: "<DemoCta />\n\n<SignupCta />",
    },
  },
  DemoCta: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description:
      'Button to the demo. Children replace the label ("Ver la demo").',
    authoring: {
      label: "Botón de demo",
      group: "calls-to-action",
      rank: 40,
      childPlaceholder: "Ver la demo",
    },
  },
  SignupCta: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Button to sign-up. Children replace the label.",
    authoring: {
      label: "Botón de registro",
      group: "calls-to-action",
      rank: 50,
      childPlaceholder: "Crear una cuenta",
    },
  },
  InflacionChart: {
    sections: ["guias"],
    kind: "leaf",
    props: z.object({ chart: chartIdSchema }).strict(),
    description:
      "A server-rendered SVG chart from the inflation dataset. `chart` picks which one; the ids are fixed by the data module.",
    authoring: {
      label: "Gráfico de inflación",
      group: "charts-summaries",
      rank: 10,
      propertyDescriptions: {
        chart: "Identificador de la serie que se quiere mostrar.",
      },
    },
  },
  TrustBlock: {
    sections: ["guias"],
    kind: "leaf",
    props: noProps,
    description:
      "The site's trust strip. Sizes itself off its container, so an article column gets the ledger-row form.",
    authoring: {
      label: "Franja de confianza",
      group: "article-structure",
      rank: 10,
      notes: ["Escribe el componente bare, sin propiedades."],
    },
  },
  Faq: {
    sections: ["guias", "noticias", "estadisticas", "investigaciones"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "Renders the questions from this page's `faq` metadata, and marks where they appear. Write a bare <Faq />; the questions themselves are metadata, not body.",
    authoring: {
      label: "Preguntas frecuentes",
      group: "article-structure",
      rank: 20,
      notes: [
        "Al insertarlo aparecen en la barra lateral los campos obligatorios de FAQ; las preguntas vienen de metadata, no de hijos ni propiedades.",
        "Escribe el componente bare, sin propiedades.",
      ],
    },
  },
  RelatedGuides: {
    sections: ["guias"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "The related-guides block. The page computes the list; write a bare <RelatedGuides /> where it should appear.",
    authoring: {
      label: "Guías relacionadas",
      group: "article-structure",
      rank: 40,
      notes: ["La página calcula la lista; no agregues propiedades."],
    },
  },
  // Shared statistics/research article furniture. The author writes bare tags;
  // the route binds the page-specific data from CMS JSONB.
  Fuentes: {
    // Not only a data-page block. A guide that walks through a real document
    // rests on the same kind of primary material a statistics page does — the
    // distributor's own "conocé tu factura", the ENARGAS resolution behind a
    // charge — and a reader who wants to check a claim deserves the link in the
    // article rather than nowhere. Noticias gets the tag for the same reason
    // and reads it from the same shared metadata key.
    sections: ["guias", "noticias", ...DATA_SECTIONS],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description: "Renders this page's source metadata.",
    authoring: {
      label: "Fuentes",
      group: "article-structure",
      rank: 30,
      notes: [
        "Al insertarlo aparecen en la barra lateral los campos obligatorios de fuentes; el contenido viene de metadata.",
        "Escribe el componente bare, sin propiedades.",
      ],
    },
  },
  Subpaginas: {
    sections: DATA_SECTIONS,
    kind: "leaf",
    props: CONTEXT_BOUND,
    description: "Renders direct CMS children of this hub page.",
    authoring: {
      label: "Subpáginas",
      group: "article-structure",
      rank: 50,
      notes: ["La página calcula las hijas directas; no agregues propiedades."],
    },
  },
  PaginaRelacionada: {
    // Guides can point readers to a related statistics or research page too;
    // the href schema below keeps the card from becoming a generic escape hatch.
    sections: ["guias", ...DATA_SECTIONS],
    kind: "container",
    props: z
      .object({ href: z.string().regex(/^\/(estadisticas|investigaciones)\//) })
      .strict(),
    description: "A related statistics or research page card.",
    authoring: {
      label: "Página relacionada",
      group: "article-structure",
      rank: 70,
      propertyDescriptions: {
        href: "Ruta de una página de estadísticas o investigación.",
      },
      propertyPlaceholders: { href: "/estadisticas/ruta" },
      childPlaceholder: "Una frase que explique por qué seguir leyendo.",
      notes: ["La ruta debe comenzar con /estadisticas/ o /investigaciones/."],
    },
  },
  IpcViviendaChart: {
    sections: ["estadisticas"],
    kind: "leaf",
    props: z
      .object({
        region: z.enum([
          "nacional",
          "gba",
          "pampeana",
          "noreste",
          "noroeste",
          "cuyo",
          "patagonia",
        ]),
        variacion: z.enum(["mensual", "interanual"]),
      })
      .strict(),
    description: "IPC housing chart for one INDEC region and variation.",
    authoring: {
      label: "IPC de vivienda",
      group: "charts-summaries",
      rank: 20,
      propertyDescriptions: {
        region: "Región del INDEC que se quiere comparar.",
        variacion: "Período de variación que muestra el gráfico.",
      },
    },
  },
  ResumenRegion: {
    sections: ["estadisticas"],
    kind: "leaf",
    props: z
      .object({
        region: z.enum([
          "gba",
          "pampeana",
          "noreste",
          "noroeste",
          "cuyo",
          "patagonia",
        ]),
      })
      .strict(),
    description: "Current IPC summary for one INDEC region.",
    authoring: {
      label: "Resumen regional del IPC",
      group: "charts-summaries",
      rank: 30,
      propertyDescriptions: {
        region: "Región del INDEC que resume la tarjeta.",
      },
    },
  },
  ...DATA_LEAF_COMPONENTS,
} as const satisfies Record<string, ContentComponentDefinition>;

export type ContentComponentName = keyof typeof CONTENT_COMPONENT_DEFINITIONS;

export const CONTENT_COMPONENT_NAMES = Object.keys(
  CONTENT_COMPONENT_DEFINITIONS,
) as ContentComponentName[];

export function isContentComponentName(
  name: string,
): name is ContentComponentName {
  return Object.hasOwn(CONTENT_COMPONENT_DEFINITIONS, name);
}

export function componentDefinition(
  name: string,
): ContentComponentDefinition | undefined {
  return isContentComponentName(name)
    ? (CONTENT_COMPONENT_DEFINITIONS[name] as ContentComponentDefinition)
    : undefined;
}

/** The components a given section may use. */
export function componentsForSection(
  section: ContentSection,
): ContentComponentName[] {
  return CONTENT_COMPONENT_NAMES.filter((name) =>
    (
      CONTENT_COMPONENT_DEFINITIONS[name] as ContentComponentDefinition
    ).sections.includes(section),
  );
}
