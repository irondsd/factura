import { z } from "zod";
import { chartIdSchema } from "../metadata/guias";
import type { ContentSection } from "../types";
import { SECTION_COMPONENT_NAMES } from "./sectionDefinitions";

// The content component manifest, *without* the components (cms.md §3.6).
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

export type ContentComponentDefinition = {
  sections: readonly ContentSection[];
  kind: ComponentKind;
  /** Validates the literal attributes written in the MDX. Always `.strict()`:
   * an unknown property is a typo that would otherwise render nothing. */
  props: z.ZodType;
  /** Shown in the CMS component help and used in the MCP tool instructions. */
  description: string;
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
    sections: ["guias", "estadisticas", "investigaciones"],
    kind: "container",
    props: z
      .object({
        title: z.string().min(1).optional(),
      })
      .strict(),
    description:
      "Closing call to action. Give it a guide-specific `title` and two sentences of body copy; without them it falls back to generic wording.",
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
  },
  CtaRow: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Places a couple of CTA buttons side by side.",
  },
  DemoCta: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description:
      'Button to the demo. Children replace the label ("Ver la demo").',
  },
  SignupCta: {
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Button to sign-up. Children replace the label.",
  },
  InflacionChart: {
    sections: ["guias"],
    kind: "leaf",
    props: z.object({ chart: chartIdSchema }).strict(),
    description:
      "A server-rendered SVG chart from the inflation dataset. `chart` picks which one; the ids are fixed by the data module.",
  },
  TrustBlock: {
    sections: ["guias"],
    kind: "leaf",
    props: noProps,
    description:
      "The site's trust strip. Sizes itself off its container, so an article column gets the ledger-row form.",
  },
  Faq: {
    sections: ["guias", "estadisticas", "investigaciones"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "Renders the questions from this page's `faq` metadata, and marks where they appear. Write a bare <Faq />; the questions themselves are metadata, not body.",
  },
  RelatedGuides: {
    sections: ["guias"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "The related-guides block. The page computes the list; write a bare <RelatedGuides /> where it should appear.",
  },
  // Shared statistics/research article furniture. The author writes bare tags;
  // the route binds the page-specific data from CMS JSONB.
  Fuentes: {
    sections: DATA_SECTIONS,
    kind: "leaf",
    props: CONTEXT_BOUND,
    description: "Renders this page's source metadata.",
  },
  Subpaginas: {
    sections: DATA_SECTIONS,
    kind: "leaf",
    props: CONTEXT_BOUND,
    description: "Renders direct CMS children of this hub page.",
  },
  PaginaRelacionada: {
    sections: DATA_SECTIONS,
    kind: "container",
    props: z
      .object({ href: z.string().regex(/^\/(estadisticas|investigaciones)\//) })
      .strict(),
    description: "A related statistics or research page card.",
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
