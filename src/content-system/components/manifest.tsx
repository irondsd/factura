import type { ComponentType } from "react";
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
import { SECTION_COMPONENT_BINDINGS } from "./sectionBindings";
import {
  CONTENT_COMPONENT_DEFINITIONS,
  type ContentComponentDefinition,
  type ContentComponentName,
} from "./definitions";

// The rendering half of the manifest: which React component each registered
// name resolves to. The rules half — names, sections, children, property
// schemas — is in `./definitions.ts`, which imports no React so the validator
// can run in a CLI.
//
// What a name resolves to must be what actually renders, so these bindings
// carry everything `src/mdx-components.tsx` applies for the filesystem path.
// Registering a bare component instead would give a database-rendered guide a
// different page from the same source, which is precisely what the exact
// preview in Phase 6 promises it will not.

export * from "./definitions";

/** The trust strip with the article's vertical rhythm. The `.mdx` writes a bare
 * `<TrustBlock />`; the margin is the article's business, like the `my-*` baked
 * into every other block in the markdown map. */
const ArticleTrustBlock = () => <TrustBlock className="my-10" />;

/** Fallback for the context-bound components. They render nothing until an
 * article route overrides them through `contentComponents()` — the same no-op
 * `mdx-components.tsx` registers, and for the same reason: with no article
 * context there is nothing to show. */
const Unbound = () => null;
const { ClosingCta: _sectionClosingCta, ...DATA_BINDINGS } =
  SECTION_COMPONENT_BINDINGS;

const BINDINGS: Record<string, ComponentType<never>> = {
  ClosingCta,
  ProbarCta,
  CtaButton,
  CtaRow,
  DemoCta,
  SignupCta,
  InflacionChart,
  TrustBlock: ArticleTrustBlock,
  Faq: Unbound,
  RelatedGuides: Unbound,
  Fuentes: Unbound,
  Subpaginas: Unbound,
  ...DATA_BINDINGS,
};

export type ContentComponentEntry = ContentComponentDefinition & {
  component: ComponentType<never>;
};

/** The complete manifest: rules plus bindings. Built by mapping over the
 * *definitions*, so a name can never be renderable without being validated. */
export const CONTENT_COMPONENTS = Object.fromEntries(
  (Object.keys(CONTENT_COMPONENT_DEFINITIONS) as ContentComponentName[]).map(
    (name) => [
      name,
      {
        ...(CONTENT_COMPONENT_DEFINITIONS[name] as ContentComponentDefinition),
        component: BINDINGS[name] as ComponentType<never>,
      },
    ],
  ),
) as unknown as Record<ContentComponentName, ContentComponentEntry>;
