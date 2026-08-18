"use client";

import { useState } from "react";
import {
  CANDIDATES,
  PREFERENCES,
  preferenceScore,
  type PreferenceId,
} from "@/content/investigacion/data/barrios-subestimados";

const metrics = [
  ["cheap", "Precio"],
  ["safe", "Seguridad"],
  ["transport", "Transporte"],
  ["publicSpace", "Verde"],
  ["future", "Futuro"],
] as const;

export function BarriosSubestimadosComparador() {
  const [preference, setPreference] = useState<PreferenceId>("equilibrio");
  const selected = PREFERENCES.find((item) => item.id === preference)!;
  const ordered = [...CANDIDATES]
    .map((candidate) => ({
      candidate,
      score: preferenceScore(candidate, preference),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <figure className="fd-card my-8 px-5 pt-5 pb-4">
      <figcaption>
        <h3 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 scroll-mt-24">
          Cambiá la prioridad, no los datos
        </h3>
        <p className="font-mono text-xs text-muted mt-1.5 opacity-85 leading-[1.6]">
          Precio y seguridad son posiciones oficiales; transporte, verde y
          futuro son evaluaciones editoriales publicadas en esta misma figura.
        </p>
      </figcaption>

      <div
        className="flex flex-wrap gap-2 mt-5"
        role="group"
        aria-label="Prioridad para ordenar los barrios"
      >
        {PREFERENCES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={preference === item.id}
            onClick={() => setPreference(item.id)}
            className={`min-h-11 px-3.5 border font-mono text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              preference === item.id
                ? "bg-ink text-paper border-ink"
                : "bg-transparent text-muted border-line hover:text-ink hover:border-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        {ordered.map(({ candidate, score }, index) => (
          <div
            key={candidate.id}
            className="border border-line bg-paper/35 p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="font-display text-[20px] font-semibold text-ink">
                <span className="font-mono text-xs text-muted mr-2">
                  {index + 1}
                </span>
                {candidate.label}
              </div>
              <span className="font-mono text-sm tabular-nums text-accent">
                {Math.round(score)}/100
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {metrics.map(([key, label]) => {
                const value = candidate[key];
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[78px_1fr_28px] items-center gap-2 font-mono text-[11px]"
                  >
                    <span className="text-muted">{label}</span>
                    <span
                      className="h-1.5 bg-line/70 overflow-hidden"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${value}%` }}
                      />
                    </span>
                    <span className="tabular-nums text-right text-muted">
                      {Math.round(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="font-mono text-xs text-muted mt-4 leading-[1.6]">
        Pesos actuales para «{selected.label.toLowerCase()}»: precio{" "}
        {selected.weights.cheap}%, seguridad {selected.weights.safe}%,
        transporte {selected.weights.transport}%, verde{" "}
        {selected.weights.publicSpace}% y futuro {selected.weights.future}%. El
        resultado sirve para revelar el canje, no para fingir precisión
        inmobiliaria.
      </p>
    </figure>
  );
}
