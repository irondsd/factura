import { describe, expect, it } from "vitest";
import {
  moveContentColumn,
  parseColumnPreferences,
  resolveColumnOrder,
  resolveColumnOrderForColumns,
  type ColumnPreferences,
  type ContentColumnDefinitionShape,
} from "./columnPreferences";

const empty: ColumnPreferences = {
  version: 1,
  hidden: [],
  placements: {},
};

describe("content column preferences", () => {
  it("migrates the original hidden-id array", () => {
    expect(
      parseColumnPreferences(
        JSON.stringify(["status", "page", "updated"]),
        "guias",
      ),
    ).toEqual({
      version: 1,
      hidden: ["status", "updated"],
      placements: {},
    });
  });

  it("keeps only valid movable columns and placements", () => {
    expect(
      parseColumnPreferences(
        JSON.stringify({
          version: 1,
          hidden: ["credits", "page", "future-column"],
          placements: {
            status: { relativeTo: "created", side: "after" },
            page: { relativeTo: "status", side: "after" },
            updated: { relativeTo: "missing", side: "before" },
            created: { relativeTo: "page", side: "before" },
          },
        }),
        "guias",
      ),
    ).toEqual({
      version: 1,
      hidden: ["credits"],
      placements: {
        status: { relativeTo: "created", side: "after" },
      },
    });
  });

  it("moves one row while retaining only placement deviations", () => {
    const moved = moveContentColumn("guias", empty, "status", "down");

    expect(resolveColumnOrder("guias", moved)).toEqual([
      "page",
      "credits",
      "status",
      "created",
      "updated",
    ]);
    expect(moved.placements).toEqual({
      credits: { relativeTo: "page", side: "after" },
      status: { relativeTo: "credits", side: "after" },
      created: { relativeTo: "status", side: "after" },
    });
  });

  it("returns to the default order when a move is undone", () => {
    const movedDown = moveContentColumn("guias", empty, "status", "down");
    const movedUp = moveContentColumn("guias", movedDown, "status", "up");

    expect(resolveColumnOrder("guias", movedUp)).toEqual([
      "page",
      "status",
      "credits",
      "created",
      "updated",
    ]);
    expect(movedUp.placements).toEqual({});
  });

  it("lets an uncustomized future column keep its new default slot", () => {
    const futureColumns: readonly ContentColumnDefinitionShape[] = [
      { id: "page", label: "Página", locked: true },
      { id: "status", label: "Estado" },
      { id: "credits", label: "Créditos" },
      { id: "reviewed", label: "Revisada" },
      { id: "created", label: "Creada" },
      { id: "updated", label: "Última edición" },
    ];

    expect(
      resolveColumnOrderForColumns(futureColumns, {
        version: 1,
        hidden: [],
        placements: {
          credits: { relativeTo: "page", side: "after" },
          status: { relativeTo: "credits", side: "after" },
          created: { relativeTo: "status", side: "after" },
        },
      }),
    ).toEqual(["page", "credits", "status", "reviewed", "created", "updated"]);
  });

  it("keeps Página first even when saved data is cyclic or hostile", () => {
    expect(
      resolveColumnOrder("guias", {
        version: 1,
        hidden: [],
        placements: {
          status: { relativeTo: "updated", side: "after" },
          updated: { relativeTo: "status", side: "after" },
          credits: { relativeTo: "page", side: "before" },
        },
      }),
    ).toEqual(["page", "credits", "created", "updated", "status"]);
  });
});
