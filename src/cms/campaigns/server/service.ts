import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canAuthor } from "@/cms/auth/policy";
import type { CmsActor } from "@/cms/types";
import { CmsForbiddenError } from "@/cms/server/errors";
import { interpolate } from "@/i18n/config";
import type { CampaignContent } from "../../../../emails/campaign";
import { CampaignValidationError, validateCampaign } from "../validation";

export type CampaignRecipient = { email: string; name: string | null };
export type CampaignMessage = { to: string; subject: string; html: string };
export type CampaignPreview = {
  html: string;
  subject: string;
  recipients: string[];
};
type Dependencies = {
  findRecipients: (emails: string[]) => Promise<CampaignRecipient[]>;
  render: (
    content: CampaignContent,
    recipient: CampaignRecipient,
  ) => Promise<string>;
  send: (
    messages: CampaignMessage[],
    idempotencyKey: string,
  ) => Promise<string[]>;
};

export class CmsCampaignService {
  constructor(private readonly deps: Dependencies) {}

  private async prepare(actor: CmsActor, input: unknown) {
    if (!canAuthor(actor)) throw new CmsForbiddenError("enviar campañas");
    const { emails, content } = validateCampaign(input);
    const found = await this.deps.findRecipients(emails);
    const byEmail = new Map(
      found.map((recipient) => [recipient.email.toLowerCase(), recipient]),
    );
    const missing = emails.filter((email) => !byEmail.has(email));
    if (missing.length) {
      throw new CampaignValidationError({
        recipients: `Estos correos no pertenecen a usuarios registrados: ${missing.join(", ")}.`,
      });
    }
    const recipients = emails.map((email) => byEmail.get(email)!);
    return { content, recipients };
  }

  async preview(actor: CmsActor, input: unknown): Promise<CampaignPreview> {
    const { content, recipients } = await this.prepare(actor, input);
    const recipient = recipients[0];
    return {
      html: await this.deps.render(content, recipient),
      subject: subjectFor(content, recipient),
      recipients: recipients.map((r) => r.email),
    };
  }

  async send(actor: CmsActor, input: unknown, requestId: string) {
    if (!z.uuid().safeParse(requestId).success) {
      throw new CampaignValidationError({
        recipients: "Recarga la página antes de enviar.",
      });
    }
    // Re-read users at send time, even if a preview already passed validation.
    const { content, recipients } = await this.prepare(actor, input);
    const messages = await Promise.all(
      recipients.map(async (recipient) => ({
        to: recipient.email,
        subject: subjectFor(content, recipient),
        html: await this.deps.render(content, recipient),
      })),
    );
    // Retries share a key, but edited copy or recipients get a different key.
    const digest = createHash("sha256")
      .update(JSON.stringify({ actor: actor.userId, content, recipients }))
      .digest("hex");
    const ids = await this.deps.send(
      messages,
      `campaign/${requestId}/${digest}`,
    );
    return { count: ids.length };
  }
}

function subjectFor(content: CampaignContent, recipient: CampaignRecipient) {
  return interpolate(content.subject, {
    name: recipient.name?.trim() || recipient.email,
    email: recipient.email,
  }).replace(/[\r\n]/g, " ");
}
