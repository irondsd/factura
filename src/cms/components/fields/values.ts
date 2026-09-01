// Reading a stored metadata value back into the shape a control can edit.
//
// Every one of these is total: the JSONB column is whatever was last written to
// it, and a field whose value is damaged renders empty rather than throwing the
// whole editor away. `MetadataDamageNotice` is what tells the editor that
// happened.

import type { MethodologyMetadata } from "@/content-system/types";

export type FaqEntry = { q: string; a: string };
export type Source = { label: string; href: string; note?: string };
export type OgImage = { eyebrow?: string; stat?: string };
export type Dataset = {
  name?: string;
  description?: string;
  temporalCoverage?: string;
  spatialCoverage?: string;
  variableMeasured?: string[];
  license?: string;
};

export const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

export const asFaq = (value: unknown): FaqEntry[] =>
  Array.isArray(value) ? (value as FaqEntry[]) : [];

export const asOgImage = (value: unknown): OgImage =>
  value && typeof value === "object" ? (value as OgImage) : {};

export const asMethodology = (value: unknown): MethodologyMetadata =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as MethodologyMetadata)
    : {};

export const asSources = (value: unknown): Source[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Source => item !== null && typeof item === "object",
      )
    : [];

export const asDataset = (value: unknown): Dataset =>
  value !== null && typeof value === "object" ? (value as Dataset) : {};

/** How many entries a list field holds, whatever it holds. Used for the
 * collapsed summary and for deciding whether to start collapsed. */
export const entryCount = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;
