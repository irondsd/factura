import { describe, expect, it } from "vitest";
import type { CmsActor } from "../types";
import { createFakeCms, seedPage, type FakeCms } from "./testFakes";

// What points at a page, for the confirmations that break those pointers.
// Against the in-memory stores: the SQL prefilter's job is to be generous, and
// what matters here is what the service keeps from what it is handed.

const actor: CmsActor = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
};

const lockOf = async (fake: FakeCms, id: string) =>
  (await fake.service.getState(actor, id)).lockVersion;

const publish = async (fake: FakeCms, id: string) =>
  fake.service.publish(actor, {
    id,
    expectedLockVersion: await lockOf(fake, id),
  });

describe("references to a page", () => {
  it("finds body links and component hrefs, in any section", async () => {
    const fake = createFakeCms();
    const target = await seedPage(fake, actor, { slug: "luz" });
    const markdown = await seedPage(fake, actor, {
      slug: "a",
      body: "Ver [la guía](/guias/luz).\n",
    });
    const href = await seedPage(fake, actor, {
      section: "noticias",
      slug: "b",
      body: '<CtaButton href="/guias/luz#cargos">Ver</CtaButton>\n',
    });

    const found = await fake.service.references(actor, target.id);

    expect(found.pages.map((page) => page.pageId).sort()).toEqual(
      [markdown.id, href.id].sort(),
    );
    expect(found.pages.every((page) => page.links)).toBe(true);
  });

  it("does not mistake a longer path for this one", async () => {
    const fake = createFakeCms();
    const target = await seedPage(fake, actor, { slug: "luz" });
    await seedPage(fake, actor, {
      slug: "otra",
      body: "Ver [luz y gas](/guias/luz-y-gas).\n",
    });

    expect((await fake.service.references(actor, target.id)).pages).toEqual([]);
  });

  it("finds a canonical, and says whether readers see the pointer", async () => {
    const fake = createFakeCms();
    const target = await seedPage(fake, actor, { slug: "fuerte" });
    const weak = await seedPage(fake, actor, { slug: "debil" });
    await fake.service.update(actor, {
      id: weak.id,
      expectedLockVersion: await lockOf(fake, weak.id),
      patch: { canonicalSlug: "fuerte" },
    });

    const draftOnly = await fake.service.references(actor, target.id);
    expect(draftOnly.pages).toMatchObject([
      { pageId: weak.id, canonical: true, links: false, live: false },
    ]);

    await publish(fake, weak.id);
    const live = await fake.service.references(actor, target.id);
    expect(live.pages).toMatchObject([{ pageId: weak.id, live: true }]);
  });

  it("does not count a page's links to itself", async () => {
    const fake = createFakeCms();
    const target = await seedPage(fake, actor, {
      slug: "luz",
      body: "Ver [arriba](/guias/luz#inicio).\n",
    });

    expect((await fake.service.references(actor, target.id)).pages).toEqual([]);
  });
});
