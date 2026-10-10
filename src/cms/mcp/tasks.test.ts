import { beforeEach, describe, expect, it, vi } from "vitest";

const { taskService, auditWrites } = vi.hoisted(() => ({
  taskService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    move: vi.fn(),
  },
  auditWrites: vi.fn(async () => undefined),
}));

vi.mock("@/cms/tasks/server/service", () => ({
  cmsTaskService: taskService,
}));
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: auditWrites })),
  },
}));

import { parseMessage } from "@/server/mcp/protocol";
import { handleCmsMessage } from "./handler";
import { CMS_SCOPES, type CmsTokenCaller } from "./tokens";
import { cmsToolListing, findCmsTool } from "./tools";

const actor: CmsTokenCaller = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: null,
  name: null,
  role: "editor",
  source: "mcp",
  tokenId: "22222222-2222-4222-8222-222222222222",
  scopes: [...CMS_SCOPES],
};

const task = {
  id: "33333333-3333-4333-8333-333333333333",
  number: 42,
  reference: "TASK-42",
  title: "Task title",
  description: "Task description",
  tags: ["content"],
  status: "backlog",
  position: 1024,
  completedAt: null,
  createdAt: "2026-10-10T12:00:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
};

const request = (method: string, params?: Record<string, unknown>) => {
  const parsed = parseMessage({ jsonrpc: "2.0", id: 1, method, params });
  if (!parsed.ok) throw new Error("Malformed test message: " + parsed.reason);
  return parsed.message;
};

const call = (name: string, args: Record<string, unknown>) =>
  handleCmsMessage(request("tools/call", { name, arguments: args }), actor);

const toolResult = (response: unknown) =>
  (
    response as {
      result: {
        content: { type: string; text: string }[];
        structuredContent?: unknown;
        isError: boolean;
      };
    }
  ).result;

describe("task tools", () => {
  it("shows reads to cms:read and mutations to cms:write", () => {
    const read = cmsToolListing(["cms:read"]).map(({ name }) => name);
    expect(read).toContain("list_tasks");
    expect(read).toContain("get_task");
    expect(read).not.toContain("create_task");
    expect(read).not.toContain("update_task");
    expect(read).not.toContain("move_task");

    const write = cmsToolListing(CMS_SCOPES).map(({ name }) => name);
    expect(write).toEqual(
      expect.arrayContaining(["create_task", "update_task", "move_task"]),
    );
    expect(
      write.filter((name) => /delete|remove|destroy|purge/.test(name)),
    ).toEqual([]);
    expect(findCmsTool("delete_task")).toBeUndefined();
    for (const name of [
      "list_tasks",
      "get_task",
      "create_task",
      "update_task",
      "move_task",
    ]) {
      const tool = cmsToolListing(CMS_SCOPES).find(
        (item) => item.name === name,
      );
      expect(tool?.inputSchema, name).toMatchObject({ type: "object" });
    }
  });

  it("validates task references, create defaults, update patches and result notes", () => {
    expect(
      findCmsTool("get_task")?.schema.safeParse({ id: "TASK-42" }).success,
    ).toBe(true);
    expect(
      findCmsTool("get_task")?.schema.safeParse({ id: "TASK-0" }).success,
    ).toBe(false);
    expect(
      findCmsTool("create_task")?.schema.safeParse({ title: "  Draft  " }),
    ).toMatchObject({
      success: true,
      data: { title: "Draft", description: "", tags: [] },
    });
    expect(
      findCmsTool("update_task")?.schema.safeParse({
        id: "TASK-42",
        patch: {},
      }).success,
    ).toBe(false);
    expect(
      findCmsTool("move_task")?.schema.safeParse({
        id: "TASK-42",
        status: "done",
        completionNote: "Finished [preview](https://example.com/result)",
      }).success,
    ).toBe(true);
    expect(
      findCmsTool("move_task")?.schema.safeParse({
        id: "TASK-42",
        status: "todo",
        completionNote: "Finished",
      }).success,
    ).toBe(false);
  });

  it("makes the human-request rule and status-only autonomy discoverable", async () => {
    expect(findCmsTool("create_task")?.description).toContain(
      "human explicitly asked",
    );
    expect(findCmsTool("update_task")?.description).toContain(
      "human explicitly asked",
    );

    const response = await handleCmsMessage(request("server/discover"), actor);
    const instructions = (response as { result: { instructions: string } })
      .result.instructions;
    expect(instructions).toContain("Create a task or edit its title");
    expect(instructions).toContain(
      "ordinary agent use may read tasks and move their status",
    );
    expect(instructions).toContain("pull request exists or content exists");
    expect(instructions).toContain("completionNote");
  });
});

describe("task MCP dispatch and audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditWrites.mockResolvedValue(undefined);
  });

  it("dispatches list and get through the task service", async () => {
    taskService.list.mockResolvedValue({ tasks: [], total: 0 });
    taskService.get.mockResolvedValue(task);

    await call("list_tasks", { view: "archive", limit: 20 });
    await call("get_task", { id: "TASK-42" });

    expect(taskService.list).toHaveBeenCalledWith(actor, {
      view: "archive",
      limit: 20,
      offset: 0,
    });
    expect(taskService.get).toHaveBeenCalledWith(actor, "TASK-42");
  });

  it("audits task writes against the returned UUID when given a reference", async () => {
    taskService.create.mockResolvedValue(task);
    taskService.update.mockResolvedValue(task);
    taskService.move.mockResolvedValue({ ...task, status: "done" });

    const created = await call("create_task", { title: "New task" });
    const updated = await call("update_task", {
      id: "TASK-42",
      patch: { title: "Changed" },
    });
    const moved = await call("move_task", { id: "TASK-42", status: "done" });

    expect(toolResult(created).isError).toBe(false);
    expect(toolResult(updated).isError).toBe(false);
    expect(toolResult(moved).isError).toBe(false);
    expect(taskService.create).toHaveBeenCalledWith(actor, {
      title: "New task",
      description: "",
      tags: [],
    });
    expect(auditWrites).toHaveBeenNthCalledWith(1, {
      actorId: actor.userId,
      pageId: null,
      resourceType: "task",
      resourceId: task.id,
      operation: "create_task",
      result: "ok",
    });
    expect(auditWrites).toHaveBeenNthCalledWith(2, {
      actorId: actor.userId,
      pageId: null,
      resourceType: "task",
      resourceId: task.id,
      operation: "update_task",
      result: "ok",
    });
    expect(auditWrites).toHaveBeenNthCalledWith(3, {
      actorId: actor.userId,
      pageId: null,
      resourceType: "task",
      resourceId: task.id,
      operation: "move_task",
      result: "ok",
    });
  });

  it("does not send a failed TASK-N reference to a UUID audit field", async () => {
    taskService.move.mockRejectedValue(new Error("Task TASK-42 not found"));

    const response = await call("move_task", {
      id: "TASK-42",
      status: "in_progress",
    });

    expect(toolResult(response).isError).toBe(true);
    expect(auditWrites).toHaveBeenCalledWith({
      actorId: actor.userId,
      pageId: null,
      resourceType: "task",
      resourceId: null,
      operation: "move_task",
      result: "error",
    });
  });
});
