import { describe, expect, it } from "vitest";
import { contentComponentInstances, sameLiteralProps } from "./instances";

describe("contentComponentInstances", () => {
  it("returns each literal property set for the requested component", () => {
    const body = [
      "## Una sección",
      '<IpcViviendaChart region="gba" variacion="mensual" />',
      '<IpcViviendaChart region="cuyo" variacion="interanual" />',
      "<VentaCabaMapa />",
    ].join("\n\n");

    expect(contentComponentInstances(body, "IpcViviendaChart")).toEqual([
      { region: "gba", variacion: "mensual" },
      { region: "cuyo", variacion: "interanual" },
    ]);
  });

  it("compares property sets independently of key order", () => {
    expect(
      sameLiteralProps(
        { region: "gba", variacion: "mensual" },
        { variacion: "mensual", region: "gba" },
      ),
    ).toBe(true);
    expect(sameLiteralProps({}, { region: "gba" })).toBe(false);
  });
});
