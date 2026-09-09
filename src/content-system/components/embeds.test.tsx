import { describe, expect, it } from "vitest";
import {
  EMBEDDABLE_COMPONENT_NAMES,
  embeddableComponentForSlug,
  embeddableContentComponents,
} from "./embeds";

describe("embeddable content components", () => {
  it("covers maps and charts while leaving tables and article furniture alone", () => {
    expect(EMBEDDABLE_COMPONENT_NAMES).toContain("AlquilerCabaMapa");
    expect(EMBEDDABLE_COMPONENT_NAMES).toContain("OfertaHistoria");
    expect(EMBEDDABLE_COMPONENT_NAMES).toContain("PrecioSeguridadDispersion");
    expect(EMBEDDABLE_COMPONENT_NAMES).not.toContain("AlquileresBuscados");
    expect(EMBEDDABLE_COMPONENT_NAMES).not.toContain("ClosingCta");
  });

  it("resolves a public component slug back to its registered binding", () => {
    const registered = embeddableComponentForSlug("venta-pba-mapa");
    expect(registered?.name).toBe("VentaPbaMapa");
    expect(registered?.definition.authoring.group).toBe("maps");
  });

  it("binds the registered visualizations but not table components", () => {
    const components = embeddableContentComponents({
      sourceHref: "/investigaciones/alquiler-y-seguridad",
      section: "investigaciones",
    });
    expect(components).toHaveProperty("PrecioSeguridadMapa");
    expect(components).not.toHaveProperty("PrecioSeguridadRanking");
  });
});
