import { describe, expect, it } from "vitest";
import { GRUPOS, NORMAS, normasDeGrupo } from "@/content/normativa/normas";

// The registry is hand-edited prose with structure around it, and the two ways
// it can go wrong are both silent in the browser: a broken cross-reference
// (a `guia` slug that no longer exists renders no link at all) and a norm whose
// status says "derogada" without saying by what. TypeScript catches neither.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GRUPO_IDS = new Set<string>(GRUPOS.map((g) => g.id));

describe("normativa registry", () => {
  it("has unique, anchor-safe ids", () => {
    const ids = NORMAS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SLUG_RE);
  });

  it("files every norm under a group that exists", () => {
    for (const n of NORMAS) expect(GRUPO_IDS.has(n.grupo)).toBe(true);
  });

  it("leaves no group empty", () => {
    // An empty section would render a heading, a blurb and nothing under it.
    for (const g of GRUPOS)
      expect(normasDeGrupo(g.id).length).toBeGreaterThan(0);
  });

  it("says what replaced anything that isn't in force", () => {
    for (const n of NORMAS) {
      if (n.estado === "vigente") continue;
      expect(
        n.estadoNota,
        `${n.id} is ${n.estado} without an estadoNota`,
      ).toBeTruthy();
    }
  });

  it("links only official https sources", () => {
    for (const n of NORMAS) {
      expect(n.fuente.href, n.id).toMatch(/^https:\/\//);
      expect(n.fuente.label, n.id).not.toBe("");
      // The retired CABA host — the one whose links rot. See the module header.
      expect(
        n.fuente.href,
        `${n.id} uses the dead www2.cedom host`,
      ).not.toMatch(/www2\.cedom/);
    }
  });

  it("keeps summaries short enough to read in a card", () => {
    for (const n of NORMAS) {
      expect(n.resumen.length, `${n.id} resumen`).toBeGreaterThan(80);
      expect(n.resumen.length, `${n.id} resumen`).toBeLessThan(560);
    }
  });
});
