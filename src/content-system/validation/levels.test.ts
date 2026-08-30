import { describe, expect, it } from "vitest";
import type { ContentDocument } from "../types";
import { GRAMMAR_CODES } from "./grammar";
import {
  LEVEL_LAYERS,
  type ContentValidationLevel,
  validateContentDocument,
} from "./index";

// The save policy, stated as the editor experiences it.
//
// Two rules pull in opposite directions and both matter:
//
//   * An editor who has spent an hour on a page must be able to **save** it,
//     finished or not. A save that refuses half-written work is a save that
//     loses work, and drafts exist precisely to be incomplete.
//   * Nothing dangerous is ever storable — not in a draft, not "temporarily",
//     not behind a flag. That one is a hard stop at every level.
//
// The layer table in `./index` encodes both. This file checks the two claims
// against real documents rather than against the table, because the table is
// what would be wrong if the policy were wrong.

const LEVELS: ContentValidationLevel[] = ["draft", "preview", "publish"];

const base: ContentDocument = {
  id: "1",
  section: "guias",
  slug: "como-leer-la-factura-de-edesur",
  status: "draft",
  title: "Cómo leer la factura de Edesur: guía completa",
  titleTag: null,
  description:
    "Aprende a leer tu factura de Edesur: número de cliente, vencimiento, total a pagar y consumo en kWh, con un ejemplo para ubicar cada dato del resumen.",
  summary: "Qué significa cada sección de la factura de Edesur.",
  cta: "¿Tu factura de Edesur subió? Mira cuánto y por qué.",
  canonicalSlug: null,
  parentId: null,
  sortOrder: 0,
  crumb: null,
  metadata: {
    keywords: ["factura de edesur", "como leer factura edesur"],
    categories: ["facturas-y-conceptos"],
    locations: ["argentina"],
  },
  body: "## Las secciones de la factura\n\nTexto.\n",
  publishedAt: null,
  contentUpdatedAt: "2026-08-09T11:30:00-03:00",
  createdAt: "2026-07-12T09:00:00-03:00",
  updatedAt: "2026-08-09T11:30:00-03:00",
  createdBy: null,
  updatedBy: null,
  lockVersion: 1,
};

const at = (level: ContentValidationLevel, patch: Partial<ContentDocument>) =>
  validateContentDocument({ ...base, ...patch }, level);

const codesAt = (
  level: ContentValidationLevel,
  patch: Partial<ContentDocument>,
) =>
  at(level, patch)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);

describe("an unfinished page still saves", () => {
  // Everything here is a page somebody is halfway through. None of it may cost
  // them their work.
  const unfinished: Record<string, Partial<ContentDocument>> = {
    "no keywords yet": {
      metadata: { keywords: [], categories: [], locations: [] },
    },
    "a body that is one sentence": { body: "Empiezo por acá.\n" },
    "an empty body": { body: "" },
    "no headings": { body: "Un párrafo suelto, sin estructura todavía.\n" },
    "a title that is far too long": {
      title:
        "Un título larguísimo que todavía no está recortado y que el validador editorial va a marcar cuando llegue el momento de publicar",
    },
    "a link to a page that does not exist yet": {
      body: "Ver [la otra guía](/guias/todavia-no-escrita).\n",
    },
    "no closing CTA": { body: "## Una sección\n\nTexto.\n" },
  };

  it.each(Object.entries(unfinished))("saves with %s", (_label, patch) => {
    expect(at("draft", patch).ok).toBe(true);
  });

  it("is refused at publish level, which is where the rules live", () => {
    // The other half of the deal: permissive on save is only defensible
    // because publish is not.
    expect(
      at("publish", {
        metadata: { keywords: [], categories: [], locations: [] },
      }).ok,
    ).toBe(false);
  });
});

describe("dangerous content is refused at every level, including a draft's", () => {
  const dangerous: Record<string, string> = {
    "a script tag": "<script>alert(1)</script>\n",
    "an iframe": '<iframe src="https://evil.example"></iframe>\n',
    "a JavaScript expression": "{globalThis.fetch('/api')}\n",
    "an import": 'import fs from "node:fs";\n',
    "an export": "export const meta = { title: 'x' };\n",
    "an event handler on an element": "<div onClick={() => 1}>x</div>\n",
    "an expression attribute on a component":
      "<ClosingCta title={globalThis.secret}>\n\nx\n\n</ClosingCta>\n",
    "a spread attribute": "<ClosingCta {...props}>\n\nx\n\n</ClosingCta>\n",
    "a javascript: link": "[hacé clic](javascript:alert(1))\n",
    "a data: link": "[descargar](data:text/html,<script>x</script>)\n",
    "a javascript: image": "![alt](javascript:alert(1))\n",
    "a javascript: link hidden in a reference":
      "Ver [esto][r].\n\n[r]: javascript:alert(1)\n",
  };

  it.each(
    Object.entries(dangerous).flatMap(([label, body]) =>
      LEVELS.map((level) => [label, level, body] as const),
    ),
  )("refuses %s at %s level", (_label, level, body) => {
    const result = at(level, { body });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("refuses it before any other layer gets an opinion", () => {
    // Grammar failures short-circuit: a body that cannot be parsed safely makes
    // every later layer report noise about a tree that was never there. What
    // matters here is that the *security* finding is the one returned, not that
    // it is buried under twelve editorial advisories.
    expect(codesAt("publish", { body: "<script>alert(1)</script>\n" })).toEqual(
      [GRAMMAR_CODES.rawHtml],
    );
  });

  it("names the grammar layer as the one that always runs", () => {
    for (const level of LEVELS) {
      expect(LEVEL_LAYERS[level].grammar).toBe(true);
    }
  });
});

describe("the levels are ordered", () => {
  it("never accepts at a stricter level what it refused at a looser one", () => {
    // The property that makes "save now, publish later" coherent: promoting a
    // page can only ever ask for more, never for less.
    const bodies = [
      base.body,
      "Empiezo por acá.\n",
      "[hacé clic](javascript:alert(1))\n",
      "## Una sección\n\nTexto con un [enlace](/guias/otra).\n",
    ];
    for (const body of bodies) {
      const ok = LEVELS.map((level) => at(level, { body }).ok);
      // draft ⊇ preview ⊇ publish: once false, it stays false.
      expect(ok, body.slice(0, 30)).toEqual(
        [...ok].sort((a, b) => Number(b) - Number(a)),
      );
    }
  });
});
