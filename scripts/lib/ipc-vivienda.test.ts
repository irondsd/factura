import { describe, expect, it } from "vitest";
import {
  mergeIpcPoints,
  parseIpcDivisionsCsv,
  type IpcPoint,
} from "./ipc-vivienda";

const HEADER =
  "Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region";

const REGIONS = [
  ["GBA", 1.5],
  ["Pampeana", 2.6],
  ["Noreste", 3.9],
  ["Noroeste", 3.3],
  ["Cuyo", 2.2],
  ["Patagonia", 2.5],
  ["Nacional", 2.2],
] as const;

const rows = (period: string): string[] =>
  REGIONS.map(
    ([region, value]) =>
      `04;Vivienda, agua, electricidad, gas y otros combustibles;` +
      `Nivel general y divisiones COICOP;${period};1000,1234;` +
      `${String(value).replace(".", ",")};48,9;${region}`,
  );

const point = (period: string, nacional = 2.2): IpcPoint => ({
  period,
  nacional,
  gba: 1.5,
  pampeana: 2.6,
  noreste: 3.9,
  noroeste: 3.3,
  cuyo: 2.2,
  patagonia: 2.5,
});

describe("parseIpcDivisionsCsv", () => {
  it("reads division 04, decimal commas and all seven regions", () => {
    const csv = [
      HEADER,
      "03;Prendas de vestir;Nivel general y divisiones COICOP;202607;1;9,9;1;Nacional",
      ...rows("202607"),
      ...rows("202608"),
    ].join("\r\n");

    expect(parseIpcDivisionsCsv(csv, "202607")).toEqual([
      point("202607"),
      point("202608"),
    ]);
  });

  it("refuses a partial latest month", () => {
    const csv = [HEADER, ...rows("202607").slice(0, -1)].join("\n");
    expect(() => parseIpcDivisionsCsv(csv, "202607")).toThrow(
      /missing nacional/,
    );
  });

  it("refuses a skipped month", () => {
    const csv = [HEADER, ...rows("202607"), ...rows("202609")].join("\n");
    expect(() => parseIpcDivisionsCsv(csv, "202607")).toThrow(
      /expected consecutive months/,
    );
  });
});

describe("mergeIpcPoints", () => {
  it("appends consecutive new months", () => {
    const existing = [point("202607")];
    const fetched = [point("202607"), point("202608")];
    expect(mergeIpcPoints(existing, fetched)).toEqual({
      points: fetched,
      added: [point("202608")],
    });
  });

  it("refuses a change to published history", () => {
    const existing = [point("202607")];
    const fetched = [point("202607", 9.9)];
    expect(() => mergeIpcPoints(existing, fetched)).toThrow(
      /changed historical month 202607/,
    );
  });
});
