import { describe, expect, it } from "vitest";
import { buildEmbedCode } from "./EmbedFigureControls";

describe("buildEmbedCode", () => {
  it("builds a responsive, lazy iframe with the exact figure properties", () => {
    const code = buildEmbedCode({
      origin: "https://factura.uno",
      sourceHref: "/estadisticas/inflacion-de-vivienda/gba",
      section: "estadisticas",
      componentName: "IpcViviendaChart",
      componentProps: { region: "gba", variacion: "mensual" },
      title: "IPC de vivienda",
      height: 612,
    });

    expect(code).toContain('width="100%"');
    expect(code).toContain('height="612"');
    expect(code).toContain('loading="lazy"');
    expect(code).toContain("/embed/estadisticas/ipc-vivienda-chart/");
    expect(code).toContain("inflacion-de-vivienda/gba?props=");
    expect(code).toContain("%22region%22%3A%22gba%22");
  });

  it("escapes copy inserted into iframe attributes", () => {
    const code = buildEmbedCode({
      origin: "https://factura.uno",
      sourceHref: "/investigaciones/ejemplo",
      section: "investigaciones",
      componentName: "PrecioSeguridadMapa",
      componentProps: {},
      title: 'Mapa de "precio" < seguridad',
      height: 500,
    });

    expect(code).toContain(
      'title="Mapa de &quot;precio&quot; &lt; seguridad — Factura"',
    );
  });
});
