import type { ComponentType } from "react";
import { z } from "zod";
import {
  ClosingCta,
  CtaButton,
  CtaRow,
  DemoCta,
  ProbarCta,
  SignupCta,
} from "@/components/guides/cta";
import { InflacionChart } from "@/components/guides/InflacionChart";
import { TrustBlock } from "@/components/landing/TrustBlock";
import { chartIdSchema } from "../metadata/guias";
import type { ContentSection } from "../types";

// The content component manifest (cms.md §3.6): one typed table that is the
// source of truth for runtime resolution, which names are allowed, which
// section each belongs to, what properties it takes, whether it accepts
// children, and the help the CMS shows an editor.
//
// Everything downstream reads this and only this. The grammar validator rejects
// a name that is not here, the renderer resolves a name through here, and the
// MCP tool descriptions are generated from here — so a component cannot be
// renderable but unvalidated, or allowed but unrenderable.
//
// `mdx-components.tsx` remains the map for the *filesystem* MDX that Next
// compiles at build time. The two must agree for guides, and
// `manifest.test.tsx` checks that they do until Phase 7 removes the filesystem
// path.

/** Whether a component may wrap markdown children. `leaf` components are
 * written self-closing and a body between tags is an error rather than
 * something silently dropped. */
export type ComponentKind = "leaf" | "container";

export type ContentComponentDefinition = {
  component: ComponentType<never>;
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

// What a name resolves to must be what actually renders, so these entries carry
// the same bindings `src/mdx-components.tsx` applies for the filesystem path.
// Registering the bare component instead would give a database-rendered guide a
// different page from the same source, which is precisely what the exact
// preview in Phase 6 promises it won't.

/** The trust strip with the article's vertical rhythm. The `.mdx` writes a bare
 * `<TrustBlock />`; the margin is the article's business, like the `my-*` baked
 * into every other block in the markdown map. */
const ArticleTrustBlock = () => <TrustBlock className="my-10" />;

/** Fallbacks for the context-bound components. They render nothing until an
 * article route overrides them through `contentComponents()` — the same no-op
 * `mdx-components.tsx` registers, and for the same reason: with no article
 * context there is nothing to show. */
const Unbound = () => null;

export const CONTENT_COMPONENTS = {
  // ── guides ────────────────────────────────────────────────────────────────
  ClosingCta: {
    component: ClosingCta,
    sections: ["guias"],
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
    component: ProbarCta,
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
    component: CtaButton,
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
    component: CtaRow,
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Places a couple of CTA buttons side by side.",
  },
  DemoCta: {
    component: DemoCta,
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description:
      'Button to the demo. Children replace the label ("Ver la demo").',
  },
  SignupCta: {
    component: SignupCta,
    sections: ["guias"],
    kind: "container",
    props: noProps,
    description: "Button to sign-up. Children replace the label.",
  },
  InflacionChart: {
    component: InflacionChart,
    sections: ["guias"],
    kind: "leaf",
    props: z.object({ chart: chartIdSchema }).strict(),
    description:
      "A server-rendered SVG chart from the inflation dataset. `chart` picks which one; the ids are fixed by the data module.",
  },
  TrustBlock: {
    component: ArticleTrustBlock,
    sections: ["guias"],
    kind: "leaf",
    props: noProps,
    description:
      "The site's trust strip. Sizes itself off its container, so an article column gets the ledger-row form.",
  },
  Faq: {
    component: Unbound,
    sections: ["guias"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "Renders the questions from this page's `faq` metadata, and marks where they appear. Write a bare <Faq />; the questions themselves are metadata, not body.",
  },
  RelatedGuides: {
    component: Unbound,
    sections: ["guias"],
    kind: "leaf",
    props: CONTEXT_BOUND,
    description:
      "The related-guides block. The page computes the list; write a bare <RelatedGuides /> where it should appear.",
  },
} as const satisfies Record<string, ContentComponentDefinition>;

export type ContentComponentName = keyof typeof CONTENT_COMPONENTS;

export const CONTENT_COMPONENT_NAMES = Object.keys(
  CONTENT_COMPONENTS,
) as ContentComponentName[];

export function isContentComponentName(
  name: string,
): name is ContentComponentName {
  return Object.hasOwn(CONTENT_COMPONENTS, name);
}

export function componentDefinition(
  name: string,
): ContentComponentDefinition | undefined {
  return isContentComponentName(name)
    ? (CONTENT_COMPONENTS[name] as ContentComponentDefinition)
    : undefined;
}

/** The components a given section may use. */
export function componentsForSection(
  section: ContentSection,
): ContentComponentName[] {
  return CONTENT_COMPONENT_NAMES.filter((name) =>
    (CONTENT_COMPONENTS[name] as ContentComponentDefinition).sections.includes(
      section,
    ),
  );
}
