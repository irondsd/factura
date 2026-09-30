"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Field, Input, Select, microLabel } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  FUENTES_ALQUILER,
  INDICES_ALQUILER,
} from "@/content/guias/data/indices-alquiler";
import { cn } from "@/lib/cn";
import { formatMoney, formatMonth } from "@/lib/format";
import {
  addMonths,
  calcularTramos,
  lastMonth,
  shiftMonthBy,
  tramoVigente,
  type Detalle,
  type Indice,
  type Resultado,
  type Tramo,
} from "@/lib/indicesAlquiler";

// <CalculadoraAlquiler />: the rent-update calculator a guide places bare.
//
// The one interactive block in the guides. Everything it knows is the two
// official series in `indices-alquiler.json` and the arithmetic in
// `lib/indicesAlquiler.ts`; this file is inputs and a table. It never
// estimates: an update whose index is not published yet says what it is
// waiting for instead of a number.
//
// The first render is identical on the server and the client (the defaults are
// derived from the data, not from the clock), so the static page carries a
// worked example. "Hoy" is read only after hydration, through
// useSyncExternalStore with a null server snapshot.

const FRECUENCIAS = [
  { value: 1, label: "Todos los meses" },
  { value: 2, label: "Cada 2 meses" },
  { value: 3, label: "Cada 3 meses (trimestral)" },
  { value: 4, label: "Cada 4 meses (cuatrimestral)" },
  { value: 6, label: "Cada 6 meses (semestral)" },
  { value: 12, label: "Cada 12 meses (anual)" },
] as const;

const DURACIONES = [12, 24, 36] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** The reader's local calendar day. Local on purpose: a tenant in Buenos
 * Aires at 22 h on the 31st is still in that month's rent. */
const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const sinSuscripcion = () => () => {};

const fechaCorta = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const fecha = (iso: string) =>
  fechaCorta.format(new Date(`${iso}T00:00:00Z`));

const mesCorto = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  timeZone: "UTC",
});
const mes = (month: string) =>
  mesCorto.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");

const decimal = (value: number, digits: number) =>
  value.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const aumento = (factor: number) =>
  `${factor >= 1 ? "+" : "−"}${decimal(Math.abs(factor - 1) * 100, 1)} %`;

function rango(desde: string, hasta: string): string {
  const [y1, y2] = [desde.slice(0, 4), hasta.slice(0, 4)];
  if (desde === hasta) return `${mes(desde)} ${y1}`;
  return y1 === y2
    ? `${mes(desde)}–${mes(hasta)} ${y1}`
    : `${mes(desde)} ${y1}–${mes(hasta)} ${y2}`;
}

function indiceUsado(detalle: Detalle): string {
  if (detalle.indice === "ipc") {
    return `IPC ${rango(detalle.desdeMes, detalle.hastaMes)}`;
  }
  const valor = (v: number | null) => (v === null ? "…" : decimal(v, 2));
  return `ICL ${valor(detalle.desde.valor)} → ${valor(detalle.hasta.valor)}`;
}

function mensajeError(resultado: Extract<Resultado, { ok: false }>, indice: Indice) {
  switch (resultado.error) {
    case "monto":
      return "Ingresá el alquiler con el que empezó el contrato.";
    case "inicio":
      return "Ingresá la fecha de inicio del contrato.";
    case "frecuencia":
      return "Elegí cada cuánto se actualiza el alquiler.";
    case "antes-de-la-serie":
      return indice === "icl"
        ? `El ICL empieza el ${fecha(resultado.minimo)}: para un contrato anterior no hay índice.`
        : `Con el IPC, la calculadora toma contratos que empiezan desde el ${fecha(resultado.minimo)}.`;
  }
}

function explicacionPendiente(tramo: Tramo): string | null {
  const p = tramo.pendiente;
  if (!p) return null;
  if (p.indice === "icl") {
    return `El ajuste del ${fecha(tramo.desde)} usa el ICL del ${fecha(p.fecha)}, que el BCRA todavía no publicó. Lo publica con unas semanas de anticipación.`;
  }
  return `El ajuste del ${fecha(tramo.desde)} usa el IPC de ${formatMonth(p.mes)}, que el INDEC publica a mediados de ${formatMonth(shiftMonthBy(p.mes, 1))}.`;
}

export function CalculadoraAlquiler() {
  const ultimoIpc = lastMonth(INDICES_ALQUILER.ipc);

  const [montoTexto, setMontoTexto] = useState("500.000");
  // A year before the last published IPC month: the example shows adjustments
  // with real figures and the next one pending.
  const [inicio, setInicio] = useState(`${shiftMonthBy(ultimoIpc, -11)}-01`);
  const [indice, setIndice] = useState<Indice>("ipc");
  const [cadaMeses, setCadaMeses] = useState(3);
  const [duracionMeses, setDuracionMeses] = useState(24);
  const [desfaseIpc, setDesfaseIpc] = useState<0 | 1>(0);

  const hoy = useSyncExternalStore(sinSuscripcion, hoyLocal, () => null);

  const monto = Number(montoTexto.replace(/\D/g, ""));
  const resultado = useMemo(
    () =>
      calcularTramos(
        { monto, inicio, indice, cadaMeses, duracionMeses, desfaseIpc },
        INDICES_ALQUILER,
      ),
    [monto, inicio, indice, cadaMeses, duracionMeses, desfaseIpc],
  );

  const fin = addMonths(inicio, duracionMeses);
  const tramos = resultado.ok ? resultado.tramos : [];
  const vigente = hoy ? tramoVigente(tramos, hoy, fin) : -1;
  const actual = vigente >= 0 ? tramos[vigente] : null;
  const primerPendiente = tramos.find((t) => t.pendiente);
  const notaPendiente = primerPendiente
    ? explicacionPendiente(primerPendiente)
    : null;

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption className="mb-5">
        <p className="font-mono text-micro uppercase tracking-label-wide text-muted">
          Calculadora de alquiler
        </p>
        <p className="mt-1 font-mono text-xs leading-[1.6] text-muted opacity-85">
          Cuánto pagás después de cada ajuste por ICL o por IPC, con los índices
          oficiales publicados.
        </p>
      </figcaption>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Alquiler al inicio ($)">
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={montoTexto}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
              setMontoTexto(
                digits ? Number(digits).toLocaleString("es-AR") : "",
              );
            }}
          />
        </Field>
        <Field label="Inicio del contrato">
          <Input
            type="date"
            value={inicio}
            min={INDICES_ALQUILER.icl.start}
            onChange={(e) => setInicio(e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-[5px]">
          <span className={microLabel}>
            Índice del contrato
          </span>
          <SegmentedControl
            label="Índice del contrato"
            size={38}
            dividers
            className="self-start"
            value={indice}
            onChange={setIndice}
            options={[
              { value: "ipc", label: "IPC (INDEC)" },
              { value: "icl", label: "ICL (BCRA)" },
            ]}
          />
        </div>
        <Field label="Actualización">
          <Select
            value={cadaMeses}
            onChange={(e) => setCadaMeses(Number(e.target.value))}
          >
            {FRECUENCIAS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duración del contrato">
          <Select
            value={duracionMeses}
            onChange={(e) => setDuracionMeses(Number(e.target.value))}
          >
            {DURACIONES.map((d) => (
              <option key={d} value={d}>
                {d / 12 === 1 ? "1 año" : `${d / 12} años`} ({d} meses)
              </option>
            ))}
          </Select>
        </Field>
        {indice === "ipc" && (
          <Field label="Meses de IPC de cada ajuste">
            <Select
              value={desfaseIpc}
              onChange={(e) => setDesfaseIpc(Number(e.target.value) as 0 | 1)}
            >
              <option value={0}>Los del período (abril usa enero a marzo)</option>
              <option value={1}>
                Un mes antes (abril usa diciembre a febrero)
              </option>
            </Select>
          </Field>
        )}
      </div>

      <div aria-live="polite" className="mt-6 min-h-[1.6em] text-[15px] leading-[1.6]">
        {!resultado.ok ? (
          <p className="text-muted">{mensajeError(resultado, indice)}</p>
        ) : actual?.monto != null ? (
          <p>
            Hoy corresponde{" "}
            <strong className="font-mono">
              {formatMoney(actual.monto, "ARS")}
            </strong>
            {vigente > 0 && (
              <>
                , desde el {fecha(actual.desde)} (
                {aumento(actual.acumulado ?? 1)} sobre el alquiler inicial)
              </>
            )}
            .
          </p>
        ) : actual ? (
          <p>
            Hoy corresponde el ajuste del {fecha(actual.desde)}, que todavía
            espera el índice.
          </p>
        ) : null}
      </div>

      {resultado.ok && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">
              Alquiler después de cada actualización
            </caption>
            <thead>
              <tr>
                <th scope="col" className="fd-th">
                  Desde
                </th>
                <th scope="col" className="fd-th hidden sm:table-cell">
                  Índice
                </th>
                <th scope="col" className="fd-th text-right">
                  Aumento
                </th>
                <th scope="col" className="fd-th text-right">
                  Alquiler
                </th>
              </tr>
            </thead>
            <tbody>
              {tramos.map((t, i) => (
                <tr key={t.desde} className={cn(i === vigente && "bg-paper")}>
                  <td className="fd-td pr-3">
                    {fecha(t.desde)}
                    {i === vigente && (
                      <span className="ml-2 font-mono text-micro uppercase tracking-label text-accent">
                        hoy
                      </span>
                    )}
                    {t.detalle && (
                      <span className="block text-muted sm:hidden">
                        {indiceUsado(t.detalle)}
                      </span>
                    )}
                  </td>
                  <td className="fd-td hidden pr-3 text-muted sm:table-cell">
                    {t.detalle ? indiceUsado(t.detalle) : "Inicio"}
                  </td>
                  <td className="fd-td fd-num pr-3">
                    {t.factor != null
                      ? aumento(t.factor)
                      : t.pendiente
                        ? "pendiente"
                        : "—"}
                  </td>
                  <td className="fd-td fd-num">
                    {t.monto != null ? formatMoney(t.monto, "ARS") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-2 font-mono text-xs leading-[1.6] text-muted">
        {notaPendiente && <p>{notaPendiente}</p>}
        <p>
          Cada ajuste multiplica el alquiler por el índice nuevo dividido por el
          anterior. Si tu contrato fija otro índice, otros meses o un redondeo,
          vale lo que dice el contrato.
        </p>
        <p>
          Fuentes:{" "}
          <a
            href={FUENTES_ALQUILER.icl.href}
            className="underline underline-offset-2"
          >
            {FUENTES_ALQUILER.icl.label}
          </a>
          , publicado hasta el {fecha(FUENTES_ALQUILER.icl.hasta)};{" "}
          <a
            href={FUENTES_ALQUILER.ipc.href}
            className="underline underline-offset-2"
          >
            {FUENTES_ALQUILER.ipc.label}
          </a>
          , hasta {formatMonth(FUENTES_ALQUILER.ipc.hasta)}.
        </p>
      </div>
    </figure>
  );
}
