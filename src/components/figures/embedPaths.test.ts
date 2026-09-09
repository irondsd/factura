import { describe, expect, it } from "vitest";
import { componentNameToSlug, embedPath } from "./embedPaths";

describe("embed paths", () => {
  it("turns component names, including initialisms, into stable URL slugs", () => {
    expect(componentNameToSlug("AlquilerCabaMapa")).toBe("alquiler-caba-mapa");
    expect(componentNameToSlug("VentaPbaMapa")).toBe("venta-pba-mapa");
  });

  it("keeps the component identity separate from a nested article path", () => {
    expect(
      embedPath({
        section: "estadisticas",
        componentName: "IpcViviendaChart",
        articleSlug: "inflacion-de-vivienda/gba",
      }),
    ).toBe("/embed/estadisticas/ipc-vivienda-chart/inflacion-de-vivienda/gba");
  });
});
