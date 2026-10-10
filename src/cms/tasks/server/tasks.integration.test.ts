import { like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CmsActor } from "@/cms/types";
import { createTestDb, hasTestDatabase } from "@/cms/server/testDb";
import { cmsTasks } from "@/db/schema";
import {
  createTaskSchema,
  listTaskSchema,
  moveTaskSchema,
  resultNoteLength,
  taskIdentifierSchema,
} from "../inputs";
import { CmsTaskService } from "./service";
import { CmsTaskStore } from "./store";

const PREFIX = `task-integration-${randomUUID()}-`;
const FIXED_ID = "00000000-0000-4000-8000-000000000001";

describe("CMS task inputs", () => {
  it("defaults list pagination and validates UUID or stable references", () => {
    expect(listTaskSchema.parse({})).toMatchObject({ limit: 200, offset: 0 });
    expect(taskIdentifierSchema.safeParse(FIXED_ID).success).toBe(true);
    expect(taskIdentifierSchema.safeParse("TASK-42").success).toBe(true);
    expect(taskIdentifierSchema.safeParse("TASK-0").success).toBe(false);
  });

  it("counts ordinary Markdown labels and Unicode while excluding link destinations", () => {
    const note = "**Listo** [PR](README.md) 😀";
    expect(resultNoteLength(note)).toBe(Array.from("Listo PR 😀").length);
    expect(resultNoteLength("[](https://example.com)")).toBe(0);
    expect(resultNoteLength("\u{1F680}".repeat(301))).toBe(301);
  });

  it("allows ordinary description text and enforces result-note limits", () => {
    expect(
      createTaskSchema.safeParse({
        title: "Tarea",
        description: "{literal} <Thing> remains ordinary Markdown text.",
      }).success,
    ).toBe(true);
    expect(
      moveTaskSchema.safeParse({
        id: FIXED_ID,
        status: "done",
        completionNote: `[PR](${"README.md" + "x".repeat(3000)})`,
      }).success,
    ).toBe(true);
    expect(
      moveTaskSchema.safeParse({
        id: FIXED_ID,
        status: "done",
        completionNote: "\u{1F680}".repeat(301),
      }).success,
    ).toBe(false);
    expect(
      moveTaskSchema.safeParse({
        id: FIXED_ID,
        status: "done",
        completionNote: "[](README.md)",
      }).success,
    ).toBe(false);
    expect(
      moveTaskSchema.safeParse({
        id: FIXED_ID,
        status: "todo",
        completionNote: "Done",
      }).success,
    ).toBe(false);
  });
});

if (!hasTestDatabase()) {
  describe.skip("CMS task SQL integration", () => {
    it("needs a local database — run `bun run test:db`", () => {});
  });
} else {
  describe("CMS task SQL integration", () => {
    const { db, client } = createTestDb();
    let instant = new Date("2026-02-10T12:00:00.000Z");
    const actor: CmsActor = {
      userId: FIXED_ID,
      email: "task-test@example.com",
      name: "Task test",
      role: "editor",
    };

    const cleanup = () =>
      db.delete(cmsTasks).where(like(cmsTasks.title, `${PREFIX}%`));

    beforeEach(async () => {
      await cleanup();
      instant = new Date("2026-02-10T12:00:00.000Z");
    });

    afterAll(async () => {
      await cleanup();
      await client.end();
    });

    const isolated = async (
      body: (service: CmsTaskService) => Promise<void>,
    ) => {
      const rollback = new Error("roll back task integration fixture");
      try {
        await db.transaction(async (tx) => {
          await body(
            new CmsTaskService(new CmsTaskStore(tx), () => new Date(instant)),
          );
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    };

    const create = (
      service: CmsTaskService,
      title: string,
      details: {
        description?: string;
        tags?: ("content" | "dev" | "research")[];
      } = {},
    ) => service.create(actor, { title: `${PREFIX}${title}`, ...details });

    it("keeps exact seven-day completions in archive and newer ones on the board", async () => {
      await isolated(async (service) => {
        const exact = await create(service, "exact-cutoff");
        const exactDone = await service.move(actor, {
          id: exact.id,
          status: "done",
        });

        instant = new Date(exactDone.completedAt!);
        instant = new Date(instant.getTime() + 7 * 24 * 60 * 60 * 1000);
        const recent = await create(service, "recent-cutoff");
        const recentDoneAt = new Date(instant.getTime() + 1);
        instant = recentDoneAt;
        const recentDone = await service.move(actor, {
          id: recent.id,
          status: "done",
        });

        instant = new Date(recentDone.completedAt!);
        instant = new Date(instant.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        const board = await service.list(actor, { search: PREFIX });
        const archive = await service.list(actor, {
          view: "archive",
          search: PREFIX,
        });

        expect(board.tasks.map((task) => task.id)).toContain(recentDone.id);
        expect(board.tasks.map((task) => task.id)).not.toContain(exactDone.id);
        expect(archive.tasks.map((task) => task.id)).toContain(exactDone.id);
        expect(archive.tasks.map((task) => task.id)).not.toContain(
          recentDone.id,
        );

        instant = new Date(recentDone.completedAt!);
        instant = new Date(instant.getTime() + 7 * 24 * 60 * 60 * 1000);
        const atCutoff = await service.list(actor, {
          view: "archive",
          search: PREFIX,
        });
        const boardAtCutoff = await service.list(actor, { search: PREFIX });
        expect(atCutoff.tasks.map((task) => task.id)).toContain(recentDone.id);
        expect(boardAtCutoff.tasks.map((task) => task.id)).not.toContain(
          recentDone.id,
        );
      });
    });

    it("puts new tasks on top of the backlog and predicts the next number", async () => {
      await isolated(async (service) => {
        const older = await create(service, "older");
        const predicted = await service.nextNumber();
        const newer = await create(service, "newer");
        expect(newer.number).toBe(predicted);

        const backlog = await service.list(actor, {
          statuses: ["backlog"],
          search: PREFIX,
        });
        expect(backlog.tasks.map((task) => task.id)).toEqual([
          newer.id,
          older.id,
        ]);
      });
    });

    it("lists every task in a view across pages", async () => {
      await isolated(async (service) => {
        const first = await create(service, "list-all");
        const all = await service.listAll(actor, "board");
        expect(all.map((task) => task.id)).toContain(first.id);
        const { total } = await service.list(actor, { view: "board" });
        expect(all).toHaveLength(total);
      });
    });

    it("lists readable previews without returning the full description", async () => {
      await isolated(async (service) => {
        const task = await create(service, "description-preview", {
          description:
            "## Review\n\nRead the [draft](https://example.com/draft).",
        });
        const result = await service.list(actor, { search: task.reference });
        const summary = result.tasks.find((item) => item.id === task.id);
        expect(summary?.descriptionPreview).toBe("Review\nRead the draft.");
        expect(summary).not.toHaveProperty("description");
        expect((await service.get(actor, task.id)).description).toBe(
          task.description,
        );
      });
    });

    it("appends a result once on retry, preserves the completion instant, and appends again after reopening", async () => {
      await isolated(async (service) => {
        const original = await create(service, "result-note", {
          description: "Short brief.",
          tags: ["dev"],
        });
        const note = "Merged [PR](README.md) 😀";
        const completed = await service.move(actor, {
          id: original.id,
          status: "done",
          completionNote: note,
        });
        expect(completed.description).toBe(
          `Short brief.\n\n### Result\n${note}`,
        );
        const completedAt = completed.completedAt;

        instant = new Date(instant.getTime() + 60_000);
        const retry = await service.move(actor, {
          id: completed.reference,
          status: "done",
          completionNote: note,
        });
        expect(retry.description).toBe(completed.description);
        expect(retry.completedAt).toBe(completedAt);

        const reopened = await service.move(actor, {
          id: completed.id,
          status: "todo",
        });
        expect(reopened.completedAt).toBeNull();
        instant = new Date(instant.getTime() + 60_000);
        const completedAgain = await service.move(actor, {
          id: completed.id,
          status: "done",
          completionNote: note,
        });
        expect(completedAgain.completedAt).toBe(instant.toISOString());
        expect(completedAgain.description).toBe(
          `${completed.description}\n\n### Result\n${note}`,
        );
      });
    });

    it("persists lane order, moves null to the end, and keeps completed tasks newest first", async () => {
      await isolated(async (service) => {
        const first = await create(service, "first");
        const second = await create(service, "second");
        const third = await create(service, "third");
        await service.move(actor, { id: first.id, status: "todo" });
        await service.move(actor, {
          id: second.id,
          status: "todo",
          beforeId: first.reference,
        });
        await service.move(actor, {
          id: third.id,
          status: "todo",
          beforeId: null,
        });
        await service.move(actor, { id: second.id, status: "todo" });

        const afterDrop = await service.list(actor, {
          statuses: ["todo"],
          search: PREFIX,
        });
        expect(afterDrop.tasks.map((task) => task.id)).toEqual([
          second.id,
          first.id,
          third.id,
        ]);

        await service.move(actor, {
          id: second.id,
          status: "todo",
          beforeId: null,
        });
        const movedToEnd = await service.list(actor, {
          statuses: ["todo"],
          search: PREFIX,
        });
        expect(movedToEnd.tasks.map((task) => task.id)).toEqual([
          first.id,
          third.id,
          second.id,
        ]);

        const earlierDone = await service.move(actor, {
          id: first.id,
          status: "done",
        });
        instant = new Date(instant.getTime() + 1_000);
        const laterDone = await service.move(actor, {
          id: second.id,
          status: "done",
        });
        const ignoredReorder = await service.move(actor, {
          id: earlierDone.id,
          status: "done",
          beforeId: laterDone.id,
        });
        expect(ignoredReorder.completedAt).toBe(earlierDone.completedAt);
        const completed = await service.list(actor, {
          statuses: ["done"],
          search: PREFIX,
        });
        expect(completed.tasks.map((task) => task.id)).toEqual([
          laterDone.id,
          earlierDone.id,
        ]);
      });
    });

    it("keeps status and description out of partial content edits", async () => {
      await isolated(async (service) => {
        const original = await create(service, "partial-edit", {
          description: "Keep {these} <literal> characters.",
          tags: ["content"],
        });
        const inProgress = await service.move(actor, {
          id: original.id,
          status: "in_progress",
        });
        expect(inProgress.description).toBe(original.description);
        const renamed = await service.update(actor, {
          id: original.id,
          patch: { title: `${PREFIX}renamed` },
        });

        expect(renamed.title).toBe(`${PREFIX}renamed`);
        expect(renamed.description).toBe(original.description);
        expect(renamed.tags).toEqual(original.tags);
        expect(renamed.status).toBe(inProgress.status);
        expect(renamed.completedAt).toBe(inProgress.completedAt);
      });
    });

    it("rolls back a completion whose appended description would exceed the limit", async () => {
      await isolated(async (service) => {
        const original = await create(service, "description-limit", {
          description: "x".repeat(99_990),
        });
        await expect(
          service.move(actor, {
            id: original.id,
            status: "done",
            completionNote: "Finished",
          }),
        ).rejects.toMatchObject({ code: "invalid" });
        const after = await service.get(actor, original.id);
        expect(after.status).toBe("backlog");
        expect(after.completedAt).toBeNull();
        expect(after.description).toBe(original.description);
      });
    });

    it("dismisses and restores a task without changing its stable reference", async () => {
      await isolated(async (service) => {
        const original = await create(service, "dismiss-round-trip");
        const dismissed = await service.move(actor, {
          id: original.id,
          status: "dismissed",
        });
        const dismissedList = await service.list(actor, {
          view: "dismissed",
          search: PREFIX,
        });
        expect(dismissedList.tasks.map((task) => task.reference)).toContain(
          original.reference,
        );

        const restored = await service.move(actor, {
          id: dismissed.reference,
          status: "backlog",
          beforeId: null,
        });
        expect(restored.id).toBe(original.id);
        expect(restored.reference).toBe(original.reference);
        expect(restored.completedAt).toBeNull();
        expect(dismissed.status).toBe("dismissed");
      });
    });
  });
}
