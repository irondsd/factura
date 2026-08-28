import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPropertyForUser: vi.fn(),
  adoptOfficialDefaults: vi.fn(),
}));

vi.mock("./defaults", () => ({
  createPropertyForUser: mocks.createPropertyForUser,
}));
vi.mock("./registry", () => ({
  adoptOfficialDefaults: mocks.adoptOfficialDefaults,
}));

import { onboardAppUser } from "./onboarding";

function fakeDatabase() {
  const memberships = new Set<string>();
  const locked: string[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => {
            locked.push("user");
            return [{ id: "user-1" }];
          },
        }),
      }),
    }),
    query: {
      propertyMembers: {
        findFirst: async () =>
          memberships.has("user-1") ? { propertyId: "property-1" } : undefined,
      },
    },
  };
  const database = {
    transaction: async <T>(work: (transaction: typeof tx) => Promise<T>) =>
      work(tx),
  };

  mocks.createPropertyForUser.mockImplementation(
    async (_tx, userId: string) => {
      memberships.add(userId);
      return { id: "property-1" };
    },
  );

  return { database, locked };
}

describe("onboardAppUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates product defaults once across repeated onboarding calls", async () => {
    const { database, locked } = fakeDatabase();

    await expect(onboardAppUser(database as never, "user-1")).resolves.toEqual({
      propertyCreated: true,
    });
    await expect(onboardAppUser(database as never, "user-1")).resolves.toEqual({
      propertyCreated: false,
    });

    expect(locked).toEqual(["user", "user"]);
    expect(mocks.createPropertyForUser).toHaveBeenCalledTimes(1);
    expect(mocks.adoptOfficialDefaults).toHaveBeenCalledTimes(2);
  });
});
