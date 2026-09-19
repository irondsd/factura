export const IPC_REGION_IDS = [
  "nacional",
  "gba",
  "pampeana",
  "noreste",
  "noroeste",
  "cuyo",
  "patagonia",
] as const;

export type IpcRegionId = (typeof IPC_REGION_IDS)[number];

export type IpcPoint = { period: string } & Record<IpcRegionId, number>;

const SOURCE_REGIONS: Record<string, IpcRegionId> = {
  Nacional: "nacional",
  GBA: "gba",
  Pampeana: "pampeana",
  Noreste: "noreste",
  Noroeste: "noroeste",
  Cuyo: "cuyo",
  Patagonia: "patagonia",
};

const REQUIRED_COLUMNS = ["Codigo", "Periodo", "v_m_IPC", "Region"] as const;

const ordinal = (period: string): number =>
  Number(period.slice(0, 4)) * 12 + Number(period.slice(4, 6)) - 1;

function assertPeriod(period: string, context: string): void {
  if (!/^\d{6}$/.test(period)) {
    throw new Error(`${context}: invalid period ${JSON.stringify(period)}`);
  }
  const month = Number(period.slice(4, 6));
  if (month < 1 || month > 12) {
    throw new Error(`${context}: month out of range in ${period}`);
  }
}

function assertOneDecimal(value: number, context: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${context}: expected a finite number`);
  }
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
    throw new Error(`${context}: expected a percentage rounded to one decimal`);
  }
}

export function assertIpcPoints(
  points: readonly IpcPoint[],
  context: string,
): void {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error(`${context}: no points`);
  }

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    assertPeriod(point.period, context);
    for (const region of IPC_REGION_IDS) {
      assertOneDecimal(point[region], `${context}: ${point.period} ${region}`);
    }
    if (i > 0) {
      const previous = points[i - 1].period;
      if (ordinal(point.period) !== ordinal(previous) + 1) {
        throw new Error(
          `${context}: expected consecutive months, got ${previous} → ${point.period}`,
        );
      }
    }
  }
}

function parseDecimal(raw: string, context: string): number {
  const value = raw.trim();
  if (!/^-?\d+(?:,\d+)?$/.test(value)) {
    throw new Error(`${context}: invalid decimal ${JSON.stringify(raw)}`);
  }
  const parsed = Number(value.replace(",", "."));
  assertOneDecimal(parsed, context);
  return parsed;
}

/**
 * Read INDEC's semicolon-delimited `serie_ipc_divisiones.csv` and return the
 * monthly variation for division 04, national total plus all six regions.
 *
 * The caller decodes the source as Windows-1252 before passing it here. The
 * fields this parser uses are ASCII, but decoding explicitly keeps the source
 * description readable in diagnostics if INDEC changes the file shape.
 */
export function parseIpcDivisionsCsv(
  csv: string,
  fromPeriod = "202001",
): IpcPoint[] {
  assertPeriod(fromPeriod, "IPC source start");

  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("IPC source: empty CSV");

  const header = lines[0].split(";");
  const column = Object.fromEntries(
    REQUIRED_COLUMNS.map((name) => {
      const index = header.indexOf(name);
      if (index < 0) throw new Error(`IPC source: missing column ${name}`);
      return [name, index];
    }),
  ) as Record<(typeof REQUIRED_COLUMNS)[number], number>;

  const valuesByPeriod = new Map<
    string,
    Partial<Record<IpcRegionId, number>>
  >();
  const seen = new Set<string>();

  for (let lineNumber = 2; lineNumber <= lines.length; lineNumber++) {
    const cells = lines[lineNumber - 1].split(";");
    if (cells[column.Codigo]?.trim() !== "04") continue;

    const period = cells[column.Periodo]?.trim() ?? "";
    assertPeriod(period, `IPC source line ${lineNumber}`);
    if (period < fromPeriod) continue;

    const sourceRegion = cells[column.Region]?.trim() ?? "";
    const region = SOURCE_REGIONS[sourceRegion];
    if (!region) {
      throw new Error(
        `IPC source line ${lineNumber}: unknown region ${JSON.stringify(sourceRegion)}`,
      );
    }

    const key = `${period}:${region}`;
    if (seen.has(key)) {
      throw new Error(`IPC source line ${lineNumber}: duplicate ${key}`);
    }
    seen.add(key);

    const value = parseDecimal(
      cells[column.v_m_IPC] ?? "",
      `IPC source line ${lineNumber}: ${period} ${region}`,
    );
    const periodValues = valuesByPeriod.get(period) ?? {};
    periodValues[region] = value;
    valuesByPeriod.set(period, periodValues);
  }

  const points = [...valuesByPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => {
      const missing = IPC_REGION_IDS.filter(
        (region) => values[region] === undefined,
      );
      if (missing.length > 0) {
        throw new Error(
          `IPC source: ${period} is missing ${missing.join(", ")}`,
        );
      }
      return {
        period,
        nacional: values.nacional!,
        gba: values.gba!,
        pampeana: values.pampeana!,
        noreste: values.noreste!,
        noroeste: values.noroeste!,
        cuyo: values.cuyo!,
        patagonia: values.patagonia!,
      };
    });

  assertIpcPoints(points, "IPC source");
  return points;
}

/**
 * Append new official months while refusing to rewrite published history.
 * Historical differences need a human review: they can be a legitimate INDEC
 * correction, but they can also mean the source schema moved under the parser.
 */
export function mergeIpcPoints(
  existing: readonly IpcPoint[],
  fetched: readonly IpcPoint[],
): { points: IpcPoint[]; added: IpcPoint[] } {
  assertIpcPoints(existing, "existing IPC data");
  assertIpcPoints(fetched, "fetched IPC data");

  if (existing[0].period !== fetched[0].period) {
    throw new Error(
      `IPC source starts at ${fetched[0].period}, existing data starts at ${existing[0].period}`,
    );
  }

  const fetchedByPeriod = new Map(
    fetched.map((point) => [point.period, point]),
  );
  for (const point of existing) {
    const official = fetchedByPeriod.get(point.period);
    if (!official) {
      throw new Error(
        `IPC source no longer contains existing month ${point.period}`,
      );
    }
    const changed = IPC_REGION_IDS.filter(
      (region) => official[region] !== point[region],
    );
    if (changed.length > 0) {
      const detail = changed
        .map((region) => `${region} ${point[region]} → ${official[region]}`)
        .join(", ");
      throw new Error(
        `IPC source changed historical month ${point.period}: ${detail}. ` +
          "Review the INDEC correction before changing published history.",
      );
    }
  }

  const lastExisting = existing.at(-1)!.period;
  const added = fetched.filter((point) => point.period > lastExisting);
  const points = [...existing, ...added];
  assertIpcPoints(points, "merged IPC data");
  return { points, added };
}
