import { describe, expect, it } from "vitest";
import type { ContentLocation } from "@/content-system/locations/types";
import type { CmsActor } from "@/cms/types";
import {
  CmsForbiddenError,
  CmsLocationConflictError,
  CmsLocationInUseError,
} from "@/cms/server/errors";
import { CmsLocationService } from "./service";
import type { CmsLocationStore, LocationUsage } from "./store";

const human: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
  source: "browser",
};
const agent: CmsActor = { ...human, source: "mcp" };

function fakeLocations() {
  const locations = new Map<string, ContentLocation>();
  const redirects = new Map<string, string>();
  const usage = new Map<string, LocationUsage[]>();
  let invalidations = 0;
  let next = 0;
  const now = new Date("2026-08-29T12:00:00.000Z");

  const store = {
    transaction: async <T>(body: (bound: CmsLocationStore) => Promise<T>) =>
      body(store as unknown as CmsLocationStore),
    list: async () =>
      [...locations.values()].filter((value) => !value.retiredAt),
    findById: async (id: string) => locations.get(id) ?? null,
    findByKey: async (key: string) =>
      [...locations.values()].find((value) => value.key === key) ?? null,
    findBySlug: async (slug: string) =>
      [...locations.values()].find((value) => value.slug === slug) ?? null,
    insert: async (input: {
      key: string;
      slug: string;
      label: string;
      title: string;
      description: string;
      sortOrder: number;
      actorId: string;
    }) => {
      const id = `00000000-0000-0000-0000-${String(++next).padStart(12, "0")}`;
      const location: ContentLocation = {
        id,
        key: input.key,
        slug: input.slug,
        label: input.label,
        title: input.title,
        description: input.description,
        sortOrder: input.sortOrder,
        lockVersion: 1,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        retiredAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      locations.set(id, location);
      return location;
    },
    updateWithLock: async (input: {
      id: string;
      expectedLockVersion: number;
      patch: Partial<ContentLocation> & { retiredAt?: Date | string | null };
      actorId: string;
    }) => {
      const location = locations.get(input.id);
      if (!location || location.lockVersion !== input.expectedLockVersion)
        return null;
      const retiredAt = input.patch.retiredAt as
        | Date
        | string
        | null
        | undefined;
      const updated: ContentLocation = {
        ...location,
        ...input.patch,
        retiredAt:
          retiredAt instanceof Date
            ? retiredAt.toISOString()
            : (retiredAt ?? location.retiredAt),
        lockVersion: location.lockVersion + 1,
        updatedBy: input.actorId,
        updatedAt: now.toISOString(),
      };
      locations.set(updated.id, updated);
      return updated;
    },
    dropRedirect: async (slug: string) => {
      redirects.delete(slug);
    },
    addRedirect: async (input: { fromSlug: string; locationId: string }) => {
      redirects.set(input.fromSlug, input.locationId);
    },
    redirectsForLocation: async (id: string) =>
      [...redirects.entries()]
        .filter(([, locationId]) => locationId === id)
        .map(([slug]) => slug),
    usage: async (key: string) => usage.get(key) ?? [],
    lockVersionOf: async (id: string) => locations.get(id)?.lockVersion ?? null,
  };

  return {
    service: new CmsLocationService(
      store as unknown as CmsLocationStore,
      () => now,
      () => {
        invalidations += 1;
      },
    ),
    locations,
    redirects,
    usage,
    invalidations: () => invalidations,
  };
}

const input = {
  label: "Gran Buenos Aires",
  title: "Contenido sobre el Gran Buenos Aires",
  description: "Guías, noticias y datos que corresponden exactamente al GBA.",
};

describe("CMS location service", () => {
  it("lets MCP create and edit copy, but never choose an address", async () => {
    const fake = fakeLocations();
    const created = await fake.service.create(agent, input);
    const updated = await fake.service.update(agent, {
      id: created.id,
      expectedLockVersion: created.lockVersion,
      patch: { label: "GBA" },
    });

    expect(created.key).toBe("gran-buenos-aires");
    expect(updated.label).toBe("GBA");
    expect(fake.invalidations()).toBe(2);
    await expect(
      fake.service.create(agent, { ...input, slug: "gba" }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
  });

  it("keeps every historical slug pointed directly at the current row", async () => {
    const fake = fakeLocations();
    const created = await fake.service.create(human, input);
    const first = await fake.service.rename(human, {
      id: created.id,
      expectedLockVersion: created.lockVersion,
      slug: "gba",
    });
    const second = await fake.service.rename(human, {
      id: created.id,
      expectedLockVersion: first.lockVersion,
      slug: "amba",
    });

    expect(second.key).toBe("gran-buenos-aires");
    expect(second.redirects).toEqual(["gran-buenos-aires", "gba"]);
    expect(fake.redirects.get("gran-buenos-aires")).toBe(created.id);
    expect(fake.redirects.get("gba")).toBe(created.id);
  });

  it("reports optimistic conflicts rather than overwriting newer copy", async () => {
    const fake = fakeLocations();
    const created = await fake.service.create(human, input);
    await fake.service.update(human, {
      id: created.id,
      expectedLockVersion: created.lockVersion,
      patch: { title: "Nuevo título" },
    });

    await expect(
      fake.service.update(human, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
        patch: { title: "Edición vieja" },
      }),
    ).rejects.toBeInstanceOf(CmsLocationConflictError);
  });

  it("refuses retirement for any active revision pointer and exposes its details", async () => {
    const fake = fakeLocations();
    const created = await fake.service.create(human, input);
    fake.usage.set(created.key, [
      {
        id: "22222222-2222-2222-2222-222222222222",
        section: "noticias",
        slug: "tarifas-en-el-gba",
        title: "Tarifas en el GBA",
        status: "preview",
      },
    ]);

    expect(await fake.service.list()).toMatchObject([
      {
        id: created.id,
        usageCount: 1,
        usage: [
          {
            section: "noticias",
            status: "preview",
            slug: "tarifas-en-el-gba",
          },
        ],
      },
    ]);
    await expect(
      fake.service.retire(human, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
      }),
    ).rejects.toBeInstanceOf(CmsLocationInUseError);
    expect(fake.locations.get(created.id)?.retiredAt).toBeNull();
  });

  it("reserves rename and retirement for browser users", async () => {
    const fake = fakeLocations();
    const created = await fake.service.create(human, input);

    await expect(
      fake.service.rename(agent, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
        slug: "gba",
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    await expect(
      fake.service.retire(agent, {
        id: created.id,
        expectedLockVersion: created.lockVersion,
      }),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
  });
});
