import { z } from "zod";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { TASK_STATUSES, TASK_TAGS } from "./types";

const MAX_DESCRIPTION_LENGTH = 100_000;
const MAX_TITLE_LENGTH = 180;
const MAX_RESULT_NOTE_RAW_LENGTH = 4_000;
const MAX_RESULT_NOTE_VISIBLE_LENGTH = 300;

type MarkdownNode = {
  type?: unknown;
  value?: unknown;
  alt?: unknown;
  children?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function isMarkdownNode(value: unknown): value is MarkdownNode {
  return isRecord(value);
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfm);

function markdownTree(markdown: string): unknown {
  return markdownProcessor.parse(markdown);
}

/** Count rendered text, including inline/code text and image alt text. Link
 * labels count, while their destinations do not. The parser decodes entities
 * and removes Markdown syntax before this walk. */
export function resultNoteLength(note: string): number {
  const tree = markdownTree(note);
  const count = (value: unknown): number => {
    if (Array.isArray(value))
      return value.reduce<number>((sum, child) => sum + count(child), 0);
    if (!isMarkdownNode(value)) return 0;

    if (
      value.type === "text" ||
      value.type === "inlineCode" ||
      value.type === "code"
    )
      return typeof value.value === "string"
        ? Array.from(value.value).length
        : 0;
    if (value.type === "break") return 1;
    if (value.type === "image" || value.type === "imageReference")
      return typeof value.alt === "string" ? Array.from(value.alt).length : 0;
    if (!Array.isArray(value.children)) return 0;

    const childLengths = value.children.map(count);
    const contentLength = childLengths.reduce((sum, length) => sum + length, 0);
    const isBlockContainer =
      value.type === "root" ||
      value.type === "list" ||
      value.type === "listItem" ||
      value.type === "blockquote" ||
      value.type === "footnoteDefinition";
    const visibleChildren = childLengths.filter((length) => length > 0).length;
    return (
      contentLength + (isBlockContainer ? Math.max(0, visibleChildren - 1) : 0)
    );
  };

  return count(tree);
}

function markdownSafetyIssues(markdown: string): string[] {
  const tree = markdownTree(markdown);
  const problems = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!isMarkdownNode(value)) return;

    if (value.type === "html")
      problems.add("La nota de resultado solo puede usar Markdown.");

    visit(value.children);
  };
  visit(tree);
  return [...problems];
}

const tagSchema = z.enum(TASK_TAGS);
const uniqueTagsSchema = z
  .array(tagSchema)
  .max(TASK_TAGS.length)
  .refine(
    (tags) => new Set(tags).size === tags.length,
    "No repitas etiquetas.",
  );

const titleSchema = z
  .string()
  .trim()
  .min(1, "El título no puede quedar vacío.")
  .max(MAX_TITLE_LENGTH);
const descriptionSchema = z.string().max(MAX_DESCRIPTION_LENGTH);

export const taskIdentifierSchema = z.union([
  z.uuid(),
  z
    .string()
    .regex(/^TASK-[1-9]\d*$/, "Usa un UUID o una referencia TASK-<número>.")
    .refine((value) => {
      const number = Number(value.slice("TASK-".length));
      return Number.isSafeInteger(number) && number <= 2_147_483_647;
    }, "El número de tarea no es válido."),
]);

export const listTaskSchema = z.object({
  view: z.enum(["board", "archive", "dismissed", "all"]).optional(),
  statuses: z
    .array(z.enum(TASK_STATUSES))
    .min(1)
    .max(TASK_STATUSES.length)
    .optional(),
  search: z.string().trim().max(200).optional(),
  tags: uniqueTagsSchema.optional(),
  limit: z.number().int().min(1).max(200).default(200),
  offset: z.number().int().min(0).default(0),
});

export const createTaskSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional().default(""),
    tags: uniqueTagsSchema.optional().default([]),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    id: taskIdentifierSchema,
    patch: z
      .object({
        title: titleSchema.optional(),
        description: descriptionSchema.optional(),
        tags: uniqueTagsSchema.optional(),
      })
      .strict()
      .refine(
        (patch) => Object.values(patch).some((value) => value !== undefined),
        "Incluye al menos un campo para actualizar.",
      ),
  })
  .strict();

const resultNoteSchema = z
  .string()
  .max(MAX_RESULT_NOTE_RAW_LENGTH)
  .trim()
  .min(1, "La nota de resultado no puede quedar vacía.")
  .superRefine((note, context) => {
    for (const message of markdownSafetyIssues(note))
      context.addIssue({ code: "custom", message });
    const visibleLength = resultNoteLength(note);
    if (visibleLength === 0)
      context.addIssue({
        code: "custom",
        message: "La nota debe incluir texto visible.",
      });
    if (visibleLength > MAX_RESULT_NOTE_VISIBLE_LENGTH)
      context.addIssue({
        code: "custom",
        message: `La nota de resultado no puede superar ${MAX_RESULT_NOTE_VISIBLE_LENGTH} caracteres visibles.`,
      });
  });

export const moveTaskSchema = z
  .object({
    id: taskIdentifierSchema,
    status: z.enum(TASK_STATUSES),
    beforeId: taskIdentifierSchema.nullable().optional(),
    completionNote: resultNoteSchema.optional(),
  })
  .strict()
  .refine(
    (input) => input.completionNote === undefined || input.status === "done",
    {
      message: "La nota de resultado solo se permite al completar una tarea.",
      path: ["completionNote"],
    },
  );
