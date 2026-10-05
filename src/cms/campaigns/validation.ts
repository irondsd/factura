import { z } from "zod";
import type { CampaignContent } from "../../../emails/campaign";

export const MAX_CAMPAIGN_RECIPIENTS = 100;
const copy = (max = 4000) =>
  z
    .string()
    .trim()
    .min(1, "Completa este campo.")
    .max(max, `Usa hasta ${max} caracteres.`);
const href = copy(2000).refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:", "mailto:"].includes(url.protocol) &&
      /^(https?:\/\/|mailto:)/i.test(value) &&
      (url.protocol !== "mailto:" || url.pathname.length > 0) &&
      !/[{}\s]/.test(value)
    );
  } catch {
    return false;
  }
}, "Usa un enlace completo https://, http:// o mailto:, sin variables.");

const contentSchema = z
  .object({
    subject: copy(200).refine(
      (value) => !/[\r\n]/.test(value),
      "El asunto debe ocupar una sola línea.",
    ),
    preheader: copy(300),
    eyebrow: copy(120),
    title: copy(200),
    headerTag: copy(120).optional(),
    footerNote: copy(1000).optional(),
    footerTagline: copy(200).optional(),
    signatureLine: copy(500).optional(),
    blocks: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("text"), text: copy() }),
          z.object({ type: z.literal("note"), text: copy() }),
          z.object({ type: z.literal("button"), label: copy(120), href }),
          z.object({
            type: z.literal("list"),
            items: z
              .array(copy(1000))
              .min(1, "Agrega al menos un elemento.")
              .max(30, "Usa hasta 30 elementos."),
          }),
          z.object({
            type: z.literal("signature"),
            name: copy(120),
            role: copy(200),
          }),
        ]),
      )
      .min(1, "Agrega al menos un bloque.")
      .max(30, "Usa hasta 30 bloques."),
  })
  .superRefine((content, ctx) => {
    // A placeholder left unresolved would otherwise reach the actual inbox.
    const check = (
      value: string,
      path: (string | number)[],
      allowed: string[],
    ) => {
      for (const match of value.matchAll(/\{([^{}]+)\}/g)) {
        if (!allowed.includes(match[1])) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `La variable {${match[1]}} no está disponible en este campo.`,
          });
        }
      }
    };
    for (const [key, value] of Object.entries(content)) {
      if (typeof value === "string")
        check(
          value,
          [key],
          key === "signatureLine" ? ["name", "role"] : ["name", "email"],
        );
    }
    content.blocks.forEach((block, index) => {
      for (const [key, value] of Object.entries(block)) {
        if (key === "type" || key === "href") continue;
        if (typeof value === "string")
          check(
            value,
            ["blocks", index, key],
            block.type === "signature" ? [] : ["name", "email"],
          );
        if (Array.isArray(value))
          value.forEach((item, n) =>
            check(item, ["blocks", index, key, n], ["name", "email"]),
          );
      }
    });
  });

export type CampaignInput = { recipients: string; content: CampaignContent };
export type CampaignErrors = Record<string, string>;
export class CampaignValidationError extends Error {
  constructor(readonly errors: CampaignErrors) {
    super("Revisa los campos marcados antes de continuar.");
  }
}

export function validateCampaign(input: unknown): {
  emails: string[];
  content: CampaignContent;
} {
  const parsed = z
    .object({
      recipients: copy(25_000),
      content: contentSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    const errors: CampaignErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.filter((part) => part !== "content").join(".");
      errors[path] ??= issue.message;
    }
    throw new CampaignValidationError(errors);
  }
  const emails = [
    ...new Set(
      parsed.data.recipients
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map((email) => email.toLowerCase()),
    ),
  ];
  const invalid = emails.filter((email) => !z.email().safeParse(email).success);
  if (invalid.length)
    throw new CampaignValidationError({
      recipients: `Correos inválidos: ${invalid.join(", ")}.`,
    });
  if (!emails.length || emails.length > MAX_CAMPAIGN_RECIPIENTS) {
    throw new CampaignValidationError({
      recipients: `Ingresa entre 1 y ${MAX_CAMPAIGN_RECIPIENTS} correos distintos.`,
    });
  }
  return { emails, content: parsed.data.content };
}
