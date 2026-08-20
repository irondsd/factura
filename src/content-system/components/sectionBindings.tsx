import type { ComponentType } from "react";
import { ClosingCta } from "@/components/guides/cta";
import { PaginaRelacionada } from "@/components/section/PaginaRelacionada";
import { AlquilerCabaMapa } from "@/components/estadisticas/AlquilerCabaMapa";
import { AlquileresBuscados } from "@/components/estadisticas/AlquileresBuscados";
import { BarriosBuscados } from "@/components/estadisticas/BarriosBuscados";
import {
  ComparacionRegiones,
  MultiploRegiones,
} from "@/components/estadisticas/ComparacionRegiones";
import { CostoCapitulos } from "@/components/estadisticas/CostoCapitulos";
import { CostoConstruccionHistoria } from "@/components/estadisticas/CostoConstruccionHistoria";
import { CostoConstruccionMapa } from "@/components/estadisticas/CostoConstruccionMapa";
import { CostoConstruccionResumen } from "@/components/estadisticas/CostoConstruccionResumen";
import { CostoPorZona } from "@/components/estadisticas/CostoPorZona";
import { DelitosCabaMapa } from "@/components/estadisticas/DelitosCabaMapa";
import { DelitosCuando } from "@/components/estadisticas/DelitosCuando";
import { DelitosHistoria } from "@/components/estadisticas/DelitosHistoria";
import { DelitosPorZona } from "@/components/estadisticas/DelitosPorZona";
import { DelitosResidentes } from "@/components/estadisticas/DelitosResidentes";
import { DelitosResumen } from "@/components/estadisticas/DelitosResumen";
import { DelitosRobos } from "@/components/estadisticas/DelitosRobos";
import { IpcViviendaChart } from "@/components/estadisticas/IpcViviendaChart";
import { OfertaAlquilerCabaMapa } from "@/components/estadisticas/OfertaAlquilerCabaMapa";
import { OfertaCambio } from "@/components/estadisticas/OfertaCambio";
import { OfertaCobertura } from "@/components/estadisticas/OfertaCobertura";
import { OfertaComposicion } from "@/components/estadisticas/OfertaComposicion";
import { OfertaHistoria } from "@/components/estadisticas/OfertaHistoria";
import { OfertaPorZona } from "@/components/estadisticas/OfertaPorZona";
import { PartidosBuscados } from "@/components/estadisticas/PartidosBuscados";
import { PrecioDepartamento } from "@/components/estadisticas/PrecioDepartamento";
import { PrecioDepartamentoPba } from "@/components/estadisticas/PrecioDepartamentoPba";
import { PrecioPartidoZona } from "@/components/estadisticas/PrecioPartidoZona";
import { PrecioPorZona } from "@/components/estadisticas/PrecioPorZona";
import { RegionesIpc } from "@/components/estadisticas/RegionesIpc";
import { RentabilidadBuscados } from "@/components/estadisticas/RentabilidadBuscados";
import { RentabilidadCabaMapa } from "@/components/estadisticas/RentabilidadCabaMapa";
import { RentabilidadContraste } from "@/components/estadisticas/RentabilidadContraste";
import { RentabilidadDispersion } from "@/components/estadisticas/RentabilidadDispersion";
import { RentabilidadHistoria } from "@/components/estadisticas/RentabilidadHistoria";
import { RentabilidadTipoCambio } from "@/components/estadisticas/RentabilidadTipoCambio";
import { ResumenIpc } from "@/components/estadisticas/ResumenIpc";
import { ResumenRegion } from "@/components/estadisticas/ResumenRegion";
import { SueloPbaContraste } from "@/components/estadisticas/SueloPbaContraste";
import { SueloPbaInterior } from "@/components/estadisticas/SueloPbaInterior";
import { SueloPbaLotes } from "@/components/estadisticas/SueloPbaLotes";
import { SueloPbaMapa } from "@/components/estadisticas/SueloPbaMapa";
import { VentaCabaMapa } from "@/components/estadisticas/VentaCabaMapa";
import { VentaPbaHistoria } from "@/components/estadisticas/VentaPbaHistoria";
import { VentaPbaMapa } from "@/components/estadisticas/VentaPbaMapa";
import { BarriosSubestimadosComparador } from "@/components/investigaciones/BarriosSubestimadosComparador";
import { BarriosSubestimadosContraste } from "@/components/investigaciones/BarriosSubestimadosContraste";
import { BarriosSubestimadosPerfiles } from "@/components/investigaciones/BarriosSubestimadosPerfiles";
import { BarriosSubestimadosResumen } from "@/components/investigaciones/BarriosSubestimadosResumen";
import { PrecioSeguridadCobertura } from "@/components/investigaciones/PrecioSeguridadCobertura";
import { PrecioSeguridadDispersion } from "@/components/investigaciones/PrecioSeguridadDispersion";
import { PrecioSeguridadMapa } from "@/components/investigaciones/PrecioSeguridadMapa";
import { PrecioSeguridadRanking } from "@/components/investigaciones/PrecioSeguridadRanking";
import { PrecioSeguridadResumen } from "@/components/investigaciones/PrecioSeguridadResumen";
import { PrecioSeguridadSensibilidad } from "@/components/investigaciones/PrecioSeguridadSensibilidad";
import { SeguridadPorDelitoComparacion } from "@/components/investigaciones/SeguridadPorDelitoComparacion";
import { SeguridadPorDelitoGanadores } from "@/components/investigaciones/SeguridadPorDelitoGanadores";

/** Runtime bindings for every chart, map, table and card already authored in
 * statistics/research MDX.  These are imported centrally so database MDX has
 * the identical client-component boundaries as the original modules. */
export const SECTION_COMPONENT_BINDINGS = {
  AlquilerCabaMapa,
  AlquileresBuscados,
  BarriosBuscados,
  BarriosSubestimadosComparador,
  BarriosSubestimadosContraste,
  BarriosSubestimadosPerfiles,
  BarriosSubestimadosResumen,
  ClosingCta,
  ComparacionRegiones,
  CostoCapitulos,
  CostoConstruccionHistoria,
  CostoConstruccionMapa,
  CostoConstruccionResumen,
  CostoPorZona,
  DelitosCabaMapa,
  DelitosCuando,
  DelitosHistoria,
  DelitosPorZona,
  DelitosResidentes,
  DelitosResumen,
  DelitosRobos,
  IpcViviendaChart,
  MultiploRegiones,
  OfertaAlquilerCabaMapa,
  OfertaCambio,
  OfertaCobertura,
  OfertaComposicion,
  OfertaHistoria,
  OfertaPorZona,
  PaginaRelacionada,
  PartidosBuscados,
  PrecioDepartamento,
  PrecioDepartamentoPba,
  PrecioPartidoZona,
  PrecioPorZona,
  PrecioSeguridadCobertura,
  PrecioSeguridadDispersion,
  PrecioSeguridadMapa,
  PrecioSeguridadRanking,
  PrecioSeguridadResumen,
  PrecioSeguridadSensibilidad,
  RegionesIpc,
  RentabilidadBuscados,
  RentabilidadCabaMapa,
  RentabilidadContraste,
  RentabilidadDispersion,
  RentabilidadHistoria,
  RentabilidadTipoCambio,
  ResumenIpc,
  ResumenRegion,
  SeguridadPorDelitoComparacion,
  SeguridadPorDelitoGanadores,
  SueloPbaContraste,
  SueloPbaInterior,
  SueloPbaLotes,
  SueloPbaMapa,
  VentaCabaMapa,
  VentaPbaHistoria,
  VentaPbaMapa,
} as const satisfies Record<string, ComponentType<never>>;

export type SectionComponentName = keyof typeof SECTION_COMPONENT_BINDINGS;
