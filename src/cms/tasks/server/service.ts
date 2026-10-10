import "server-only";
import { canAuthor } from "@/cms/auth/policy";
import { parseInput } from "@/cms/server/inputs";
import {
  CmsForbiddenError,
  CmsNotFoundError,
  CmsValidationError,
} from "@/cms/server/errors";
import type { CmsActor } from "@/cms/types";
import {
  createTaskSchema,
  listTaskSchema,
  moveTaskSchema,
  taskIdentifierSchema,
  updateTaskSchema,
} from "../inputs";
import { ARCHIVE_AGE_MS } from "../display";
import type {
  CmsTask,
  CmsTaskSummary,
  TaskStatus,
  TaskView,
} from "../types";
import type { EditableTaskFields } from "./store";
import { CmsTaskStore, cmsTaskStore } from "./store";

function taskIn(
  store: CmsTaskStore,
  identifier: string,
): Promise<CmsTask | null> {
  if (identifier.startsWith("TASK-"))
    return store.findByNumber(Number(identifier.slice("TASK-".length)));
  return store.findById(identifier);
}

function invalid(message: string, field?: string): CmsValidationError {
  return new CmsValidationError([
    {
      code: "task.invalid",
      severity: "error",
      message,
      ...(field ? { field } : {}),
    },
  ]);
}

function sameOrder(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

export class CmsTaskService {
  constructor(
    private readonly store: CmsTaskStore = cmsTaskStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(
    _actor: CmsActor,
    input?: unknown,
  ): Promise<{ tasks: CmsTaskSummary[]; total: number }> {
    const parsed = parseInput(listTaskSchema, input ?? {});
    const now = this.clock();
    return this.store.list({
      view: parsed.view ?? "board",
      statuses: parsed.statuses,
      search: parsed.search || undefined,
      tags: parsed.tags,
      limit: parsed.limit,
      offset: parsed.offset,
      cutoff: new Date(now.getTime() - ARCHIVE_AGE_MS),
    });
  }

  /** Every task in a view, page by page. The board and the archive filter in
   * the browser, so they need the whole set rather than one page of it. */
  async listAll(
    actor: CmsActor,
    view: TaskView,
  ): Promise<CmsTaskSummary[]> {
    const tasks: CmsTaskSummary[] = [];
    for (;;) {
      const page = await this.list(actor, {
        view,
        limit: 200,
        offset: tasks.length,
      });
      tasks.push(...page.tasks);
      if (!page.tasks.length || tasks.length >= page.total) return tasks;
    }
  }

  /** Display-only preview of the next task's reference. */
  nextNumber(): Promise<number> {
    return this.store.nextNumber();
  }

  async get(_actor: CmsActor, rawIdentifier: unknown): Promise<CmsTask> {
    const identifier = parseInput(taskIdentifierSchema, rawIdentifier);
    const task = await taskIn(this.store, identifier);
    if (!task) throw new CmsNotFoundError(`Task ${identifier}`);
    return task;
  }

  async create(actor: CmsActor, rawInput: unknown): Promise<CmsTask> {
    this.assertMayAuthor(actor);
    const input = parseInput(createTaskSchema, rawInput);
    const now = this.clock();
    return this.store.transaction(async (store) => {
      await store.lockOrdering();
      await store.shiftBacklogDown();
      return store.insert({ ...input, position: 0, now });
    });
  }

  async update(actor: CmsActor, rawInput: unknown): Promise<CmsTask> {
    this.assertMayAuthor(actor);
    const input = parseInput(updateTaskSchema, rawInput);
    const patch: EditableTaskFields = {};
    if (input.patch.title !== undefined) patch.title = input.patch.title;
    if (input.patch.description !== undefined)
      patch.description = input.patch.description;
    if (input.patch.tags !== undefined) patch.tags = input.patch.tags;
    const task = await this.store.updateContent(
      await this.requiredId(input.id),
      patch,
      this.clock(),
    );
    if (!task) throw new CmsNotFoundError(`Task ${input.id}`);
    return task;
  }

  async move(actor: CmsActor, rawInput: unknown): Promise<CmsTask> {
    this.assertMayAuthor(actor);
    const input = parseInput(moveTaskSchema, rawInput);
    const now = this.clock();

    return this.store.transaction(async (store) => {
      await store.lockOrdering();
      const current = await taskIn(store, input.id);
      if (!current) throw new CmsNotFoundError(`Task ${input.id}`);

      const destination = await store.laneIds(input.status);
      const source =
        current.status === input.status
          ? destination
          : await store.laneIds(current.status);
      const beforeIdentifier =
        input.status === "done" || input.beforeId === null
          ? undefined
          : input.beforeId;
      const foundBefore =
        beforeIdentifier === undefined
          ? undefined
          : await taskIn(store, beforeIdentifier);
      if (beforeIdentifier !== undefined && !foundBefore)
        throw new CmsNotFoundError(`Task ${beforeIdentifier}`);
      const before = foundBefore ?? undefined;

      if (before?.id === current.id && current.status !== input.status)
        throw invalid(
          "No puedes colocar una tarea antes de sí misma.",
          "beforeId",
        );

      let nextDestination = destination;
      if (current.status !== input.status) {
        nextDestination = destination.filter((id) => id !== current.id);
        const insertAt = this.beforeIndex(
          nextDestination,
          before,
          input.status,
        );
        nextDestination.splice(insertAt, 0, current.id);
      } else if (input.status !== "done") {
        if (input.beforeId === null) {
          nextDestination = destination.filter((id) => id !== current.id);
          nextDestination.push(current.id);
        } else if (before !== undefined && before.id !== current.id) {
          nextDestination = destination.filter((id) => id !== current.id);
          const insertAt = this.beforeIndex(
            nextDestination,
            before,
            input.status,
          );
          nextDestination.splice(insertAt, 0, current.id);
        }
      }

      const statusChanged = current.status !== input.status;
      const noteBlock = input.completionNote
        ? `\n\n### Result\n${input.completionNote}`
        : undefined;
      const appendNote =
        noteBlock !== undefined &&
        !(current.status === "done" && current.description.includes(noteBlock));
      if (
        appendNote &&
        noteBlock &&
        current.description.length + noteBlock.length > 100_000
      )
        throw invalid(
          "La descripción no puede superar 100000 caracteres.",
          "completionNote",
        );
      const orderChanged = !sameOrder(destination, nextDestination);
      const needsMutation = statusChanged || orderChanged || appendNote;
      if (!needsMutation) return current;

      const patch: {
        status?: TaskStatus;
        completedAt?: Date | null;
        description?: string;
      } = {};
      if (statusChanged) {
        patch.status = input.status;
        patch.completedAt = input.status === "done" ? now : null;
      }
      if (appendNote && noteBlock)
        patch.description = current.description + noteBlock;

      const updated = await store.moveFields(current.id, patch, now);
      if (!updated) throw new CmsNotFoundError(`Task ${input.id}`);

      if (current.status !== input.status)
        await store.setLaneOrder(
          source.filter((id) => id !== current.id),
          now,
        );
      if (orderChanged || statusChanged)
        await store.setLaneOrder(nextDestination, now);

      return (await taskIn(store, current.id)) ?? updated;
    });
  }

  private async requiredId(identifier: string): Promise<string> {
    const task = await taskIn(this.store, identifier);
    if (!task) throw new CmsNotFoundError(`Task ${identifier}`);
    return task.id;
  }

  private beforeIndex(
    destination: string[],
    before: CmsTask | undefined,
    status: TaskStatus,
  ): number {
    if (before === undefined) return destination.length;
    if (before.status !== status)
      throw invalid(
        "La tarea de referencia debe estar en la misma columna.",
        "beforeId",
      );
    const index = destination.indexOf(before.id);
    if (index < 0)
      throw invalid(
        "No se encontró la tarea de referencia en la columna.",
        "beforeId",
      );
    return index;
  }

  private assertMayAuthor(actor: CmsActor): void {
    if (!canAuthor(actor)) throw new CmsForbiddenError("editar tareas");
  }
}

export const cmsTaskService = new CmsTaskService();
