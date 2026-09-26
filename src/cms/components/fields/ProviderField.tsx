"use client";

import { useState } from "react";
import { MediaPicker } from "@/cms/media/components/MediaPicker";
import {
  PROVIDER_TEXT_FIELDS,
  type ProviderMetadata,
  type ProviderTextKey,
} from "@/content-system/types";
import { inputClass } from "./controls";

// «Ficha del proveedor»: the data behind `<ProviderSummary />`.
//
// Laid out the way the card reads — the logo and what the company sells, then
// the four figures with the line under each, then the identifiers from the
// bill — so an editor fills it top to bottom against the preview.
//
// Blank inputs are dropped rather than stored as `""`, and an object with
// nothing left is an absent card, the rule `MethodologyInput` follows: the
// metadata never carries a key nothing renders.

const LABEL =
  "mb-1 block font-mono text-[11px] uppercase tracking-label-wide text-muted";
const HEADING =
  "m-0 font-mono text-micro uppercase tracking-label-wide text-ink";

function clean(next: ProviderMetadata): ProviderMetadata | undefined {
  const kept = Object.fromEntries(
    Object.entries(next).filter(([, entry]) =>
      Array.isArray(entry)
        ? entry.length > 0
        : typeof entry === "string" && entry.trim() !== "",
    ),
  ) as ProviderMetadata;
  return Object.keys(kept).length === 0 ? undefined : kept;
}

export function ProviderInput({
  value,
  onChange,
}: {
  value: ProviderMetadata;
  onChange: (next: ProviderMetadata | undefined) => void;
}) {
  const set = (patch: Partial<ProviderMetadata>) =>
    onChange(clean({ ...value, ...patch }));

  // The services are a list, typed as one comma-separated line. The line is
  // kept as typed so a trailing «, » survives the keystroke that makes it; the
  // list is what is stored.
  const [servicesText, setServicesText] = useState(
    (value.services ?? []).join(", "),
  );

  const text = (key: ProviderTextKey) => {
    const field = PROVIDER_TEXT_FIELDS.find((entry) => entry.key === key)!;
    return (
      <label key={key} className="block">
        <span className={LABEL}>{field.label}</span>
        <input
          type="text"
          value={value[key] ?? ""}
          placeholder={field.placeholder}
          onChange={(event) => set({ [key]: event.target.value })}
          className={inputClass}
        />
      </label>
    );
  };

  const figures = [
    ["customers", "customersNote"],
    ["since", "sinceNote"],
    ["kind", "kindNote"],
    ["headquarters", "headquartersNote"],
  ] as const;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p className="m-0 font-mono text-[12px] leading-[1.5] text-muted">
          El nombre de la empresa sale del campo «Proveedor» de la barra
          lateral. Cada campo es opcional: uno vacío no se dibuja.
        </p>
        <div>
          <span className={LABEL}>Logo</span>
          <MediaPicker
            value={value.logoMediaId ?? null}
            onChange={(id) => set({ logoMediaId: id ?? undefined })}
          />
        </div>
        <label className="block">
          <span className={LABEL}>Servicios</span>
          <input
            type="text"
            value={servicesText}
            placeholder="Agua potable, Cloacas"
            onChange={(event) => {
              setServicesText(event.target.value);
              set({
                services: event.target.value
                  .split(",")
                  .map((service) => service.trim())
                  .filter(Boolean),
              });
            }}
            className={inputClass}
          />
        </label>
        {text("website")}
      </div>

      <div className="grid gap-3">
        <h4 className={HEADING}>Cifras</h4>
        {figures.map(([main, note]) => (
          <div key={main} className="grid grid-cols-2 gap-3">
            {text(main)}
            {text(note)}
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <h4 className={HEADING}>Datos de la factura</h4>
        {text("cuit")}
        {text("legalName")}
        {text("regulator")}
        {text("billName")}
      </div>
    </div>
  );
}
