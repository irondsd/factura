import { describe, expect, it } from "vitest";
import type { CmsMediaStore, UsageEntry } from "./store";
import { writeRevisionUsage } from "./usage";

// What a save records as media usage. The rows are foreign keys into the
// library, so an id that names nothing — a typo, a permalink copied from
// another environment — must be left out rather than fail the save it rides on.

const KNOWN = "8f2c1b9e-4a3d-4c5b-9e7f-1a2b3c4d5e6f";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

function fakeStore(known: string[]) {
  const written: UsageEntry[][] = [];
  const store = {
    knownIds: async (ids: readonly string[]) =>
      new Set(ids.filter((id) => known.includes(id))),
    replaceRevisionUsage: async (input: { entries: UsageEntry[] }) => {
      written.push(input.entries);
    },
  } as unknown as CmsMediaStore;
  return { store, written };
}

describe("writeRevisionUsage", () => {
  it("records only the images the library has", async () => {
    const { store, written } = fakeStore([KNOWN]);

    await writeRevisionUsage({
      store,
      revision: {
        id: "rev-1",
        bodyMdx: `![Medidor](/media/${KNOWN}/medidor.jpg)\n\n![Otro](/media/${UNKNOWN}/otro.jpg)\n`,
        metadata: { previewMediaId: UNKNOWN },
      },
      now: new Date("2026-09-27T12:00:00.000Z"),
    });

    expect(written).toHaveLength(1);
    expect(written[0].map((entry) => entry.mediaId)).toEqual([KNOWN]);
  });
});
