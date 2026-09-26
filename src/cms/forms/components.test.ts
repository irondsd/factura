import { describe, expect, it } from "vitest";
import { componentEntries, componentTally } from "./components";
import { sectionFields } from "./fields";

const fields = sectionFields("guias");

const entries = (
  body: string,
  metadata: Record<string, unknown> = {},
  diagnostics: Parameters<typeof componentEntries>[1]["diagnostics"] = [],
) =>
  componentEntries(fields, {
    body,
    values: Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        `metadata.${key}`,
        value,
      ]),
    ),
    diagnostics,
  });

const faq = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ q: `¿Pregunta ${i}?`, a: "Sí." }));

describe("componentEntries", () => {
  it("lists only the components the body places", () => {
    expect(entries("Texto sin etiquetas.")).toEqual([]);
    expect(entries("<Faq />").map((e) => e.component)).toEqual(["Faq"]);
  });

  it("does not mistake a longer tag for a component", () => {
    expect(entries("<FaqLista />")).toEqual([]);
  });

  it("marks a placed, empty component as unfinished", () => {
    const [faqEntry] = entries("<Faq />");
    expect(faqEntry.state).toBe("error");
    const [methodology] = entries("<Metodologia />");
    expect(methodology.state).toBe("warning");
  });

  it("is finished once every entry is filled in", () => {
    const [faqEntry] = entries("<Faq />", { faq: faq(4) });
    expect(faqEntry).toMatchObject({ state: "ok", summary: "4 preguntas" });
  });

  it("catches a half-written entry and markup in an answer", () => {
    const [blank] = entries("<Faq />", {
      faq: [...faq(3), { q: "¿Y esto?", a: "" }],
    });
    expect(blank.state).toBe("error");
    const [markup] = entries("<Faq />", {
      faq: [...faq(3), { q: "¿Y esto?", a: "Ver [acá](/x)." }],
    });
    expect(markup.state).toBe("error");
  });

  it("keeps data the body no longer places, last and unfinished", () => {
    const list = entries("<Fuentes />", {
      faq: faq(4),
      sources: [{ label: "ENRE", href: "https://enre.gov.ar" }],
    });
    expect(list.map((e) => [e.component, e.placed, e.state])).toEqual([
      ["Fuentes", true, "ok"],
      ["Faq", false, "error"],
    ]);
  });

  it("folds in what the server said when the local checks are satisfied", () => {
    const [faqEntry] = entries("<Faq />", { faq: faq(4) }, [
      {
        code: "x",
        severity: "error",
        message: "meta.faq.1.q too long",
        field: "faq.1.q",
      },
    ]);
    expect(faqEntry.state).toBe("error");
    expect(faqEntry.problems).toEqual(["meta.faq.1.q too long"]);
  });
});

describe("componentTally", () => {
  it("is green only when every card is finished", () => {
    expect(componentTally(entries("<Faq />", { faq: faq(4) }))).toEqual({
      count: 1,
      ok: true,
    });
    expect(
      componentTally(entries("<Faq />\n<Fuentes />", { faq: faq(4) })),
    ).toEqual({ count: 2, ok: false });
  });
});

describe("the company card", () => {
  const providerFields = sectionFields("proveedores");
  const card = (body: string, provider?: unknown) =>
    componentEntries(providerFields, {
      body,
      values: provider === undefined ? {} : { "metadata.provider": provider },
      diagnostics: [],
    });

  it("is offered only on /proveedores", () => {
    expect(
      sectionFields("guias").some((f) => f.path === "metadata.provider"),
    ).toBe(false);
    expect(card("<ProviderSummary />").map((e) => e.component)).toEqual([
      "ProviderSummary",
    ]);
  });

  it("asks for data when placed empty, and counts what is filled", () => {
    const [empty] = card("<ProviderSummary />");
    expect(empty.state).toBe("warning");
    const [filled] = card("<ProviderSummary />", {
      logoMediaId: "00000000-0000-4000-8000-000000000003",
      services: ["Luz"],
      since: "1992",
    });
    expect(filled.state).toBe("ok");
    expect(filled.summary).toBe("3 / 15 campos");
  });

  it("keeps stranded card data on screen so it can be cleared", () => {
    const [stranded] = card("Sin etiqueta.", { since: "1992" });
    expect(stranded.placed).toBe(false);
    expect(stranded.state).toBe("error");
  });
});

describe("the ratings card", () => {
  const card = (body: string, reviews?: unknown) =>
    componentEntries(sectionFields("proveedores"), {
      body,
      values: reviews === undefined ? {} : { "metadata.reviews": reviews },
      diagnostics: [],
    });

  it("asks for a platform, a valid score and a date", () => {
    expect(card("<Opiniones />")[0].state).toBe("error");
    expect(
      card("<Opiniones />", { sources: [{ name: "Trustpilot", score: 7 }] })[0]
        .state,
    ).toBe("error");
    expect(
      card("<Opiniones />", { sources: [{ name: "Trustpilot", score: 2 }] })[0]
        .state,
    ).toBe("warning");
    const [done] = card("<Opiniones />", {
      updated: "2026-09-26",
      sources: [{ name: "Trustpilot", score: 2 }],
    });
    expect(done.state).toBe("ok");
    expect(done.summary).toBe("1 plataforma");
  });
});
