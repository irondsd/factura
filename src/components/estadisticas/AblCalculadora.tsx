"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import {
  ADICIONAL,
  type BarrioId,
  barrioLabel,
  calcular,
  factor,
  formatCoef,
  formatPct,
  formatPesos,
  LEY,
  MINIMO,
  SOURCE,
  subzonasOf,
} from "@/content/estadisticas/data/abl-caba";
import { BARRIOS } from "@/content/shared/caba";

// <AblCalculadora />: what the Ley Impositiva charges a property, from its VFH
// and where it is.
//
// Everything it knows is `abl-caba.ts`; this file is inputs and a table. It is
// embeddable like the maps (see `embeddable` in definitions.ts), so it carries
// its own source line and never links back into the article it came from.
//
// ── What the number is ────────────────────────────────────────────────────
// The *tributo determinado*: the year's tax by the formula of arts. 41–44,
// divided by twelve. It is not a forecast of a boleta. Art. 44 caps every
// cuota at the previous one plus the IPCBA, so a property still catching up
// with a revaluation is billed less than this, and the discounts AGIP stacks
// on top (pago anual, débito, buen cumplimiento) come off the boleta after.
// The note under the result says both, every time, because the reader who
// compares this with their boleta and finds a gap needs the reason right
// there.
//
// The first render is the same on server and client — no clock, no storage —
// so the static page carries a worked example with real figures.

const BARRIOS_ORDENADOS = [...BARRIOS].sort((a, b) =>
  a.label.localeCompare(b.label, "es"),
);

const DEFAULT_BARRIO: BarrioId = "caballito";
/** Caballito's middle subzona, between Avellaneda and Alberdi. */
const DEFAULT_SUBZONA = 1;

const soloDigitos = (s: string) => s.replace(/\D/g, "").slice(0, 13);

export function AblCalculadora() {
  const [vfhTexto, setVfhTexto] = useState("30.000.000");
  const [barrio, setBarrio] = useState<BarrioId>(DEFAULT_BARRIO);
  const [subzona, setSubzona] = useState(DEFAULT_SUBZONA);
  const [tipo, setTipo] = useState<"vivienda" | "complementaria">("vivienda");

  const subzonas = subzonasOf(barrio);
  const elegida = subzonas[Math.min(subzona, subzonas.length - 1)];
  const vfh = Number(soloDigitos(vfhTexto));

  const r =
    vfh > 0
      ? calcular({
          vfh,
          cg: elegida.cg,
          complementaria: tipo === "complementaria",
        })
      : null;

  const filas = r
    ? [
        {
          id: "ii",
          concepto: "Impuesto Inmobiliario",
          detalle: `Tramo ${r.segmento.id} de la escala`,
          valor: r.inmobiliario,
        },
        {
          id: "tasa",
          concepto: "Tasa ABL",
          detalle: `Coeficiente ${formatCoef(elegida.cg)} · factor ${formatCoef(factor(elegida.cg))}`,
          valor: r.tasa,
        },
        ...(r.adicional > 0
          ? [
              {
                id: "adicional",
                concepto: "Adicional sobre la tasa",
                detalle: `${formatPct(ADICIONAL.rate)} por VFH mayor a ${formatPesos(ADICIONAL.threshold)}`,
                valor: r.adicional,
              },
            ]
          : []),
      ]
    : [];

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-5">
        <p className="font-mono text-micro uppercase tracking-label-wide text-muted">
          Calculadora de ABL en CABA {LEY.year}
        </p>
        <p className="mt-1 font-mono text-xs leading-[1.6] text-muted opacity-85">
          Cuánto fija la Ley Impositiva para tu partida según la valuación
          fiscal y la ubicación del inmueble.
        </p>
      </figcaption>

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Valuación Fiscal Homogénea ($)">
          <Input
            className="w-full min-w-0"
            inputMode="numeric"
            autoComplete="off"
            value={vfhTexto}
            onChange={(e) => {
              const digits = soloDigitos(e.target.value);
              setVfhTexto(digits ? Number(digits).toLocaleString("es-AR") : "");
            }}
          />
        </Field>
        <Field label="Barrio">
          <Select
            className="w-full min-w-0"
            value={barrio}
            onChange={(e) => {
              setBarrio(e.target.value as BarrioId);
              setSubzona(0);
            }}
          >
            {BARRIOS_ORDENADOS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        {subzonas.length > 1 && (
          <div className="sm:col-span-2">
            <Field label="Subzona">
              <Select
                className="w-full min-w-0 truncate"
                value={subzona}
                onChange={(e) => setSubzona(Number(e.target.value))}
              >
                {subzonas.map((s, i) => (
                  <option key={i} value={i}>
                    {formatCoef(s.cg)} · {s.tramo}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Tipo de unidad">
          <Select
            className="w-full min-w-0"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="vivienda">Vivienda, local u oficina</option>
            <option value="complementaria">Cochera o baulera</option>
          </Select>
        </Field>
      </div>

      <div
        aria-live="polite"
        className="mt-6 min-h-[1.6em] text-[15px] leading-[1.6]"
      >
        {r ? (
          <p>
            Cuota mensual estimada{" "}
            <strong className="font-mono">{formatPesos(r.cuota)}</strong>, o{" "}
            <span className="font-mono">{formatPesos(r.total)}</span> en el año:
            el {formatPct(r.total / vfh)} de la VFH.
          </p>
        ) : (
          <p className="text-muted">
            Ingresá la Valuación Fiscal Homogénea de la partida.
          </p>
        )}
      </div>

      {r && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">
              Composición del ABL anual de la partida
            </caption>
            <thead>
              <tr>
                <th scope="col" className="fd-th">
                  Concepto
                </th>
                <th scope="col" className="fd-th text-right">
                  Por año
                </th>
                <th scope="col" className="fd-th text-right">
                  Por mes
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="fd-td pr-3 text-left font-normal">
                    {f.concepto}
                    <span className="block text-muted">{f.detalle}</span>
                  </th>
                  <td className="fd-td fd-num pr-3">{formatPesos(f.valor)}</td>
                  <td className="fd-td fd-num">{formatPesos(f.valor / 12)}</td>
                </tr>
              ))}
              <tr className="bg-paper">
                <th scope="row" className="fd-td pr-3 text-left">
                  Total
                </th>
                <td className="fd-td fd-num pr-3 text-ink">
                  {formatPesos(r.total)}
                </td>
                <td className="fd-td fd-num text-ink">
                  {formatPesos(r.cuota)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-2 font-mono text-xs leading-[1.6] text-muted">
        {r?.minimo && (
          <p>
            La fórmula da menos que el mínimo por partida (
            {formatPesos(
              tipo === "complementaria"
                ? MINIMO.complementaria
                : MINIMO.general,
            )}{" "}
            al año), así que se aplica el mínimo.
          </p>
        )}
        <p>
          Es el monto que determina la fórmula de la ley para{" "}
          {barrioLabel(barrio)}. La boleta puede ser menor: cada cuota no puede
          subir más que la anterior más la inflación porteña (IPCBA) de cinco
          meses antes, y los descuentos de AGIP se restan después.
        </p>
        <p>
          La VFH figura al pie de la boleta de AGIP y se consulta con la partida
          y el dígito verificador. Fuente: {SOURCE}.
        </p>
      </div>
    </figure>
  );
}
