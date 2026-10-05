import "server-only";
import { inArray, sql } from "drizzle-orm";
import { render } from "@react-email/render";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendCampaignEmails } from "@/server/email";
import { CampaignEmail } from "../../../../emails/campaign";
import { CmsCampaignService } from "./service";

export const cmsCampaignService = new CmsCampaignService({
  findRecipients: (emails) =>
    db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(inArray(sql`lower(${users.email})`, emails)),
  render: (content, recipient) =>
    render(
      CampaignEmail({
        locale: "es",
        content,
        vars: {
          name: recipient.name?.trim() || recipient.email,
          email: recipient.email,
        },
      }),
    ),
  send: sendCampaignEmails,
});
