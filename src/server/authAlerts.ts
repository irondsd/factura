import "server-only";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { ClientReading } from "./sessions";
import { sendSignInMessage } from "./telegram";

/** "Someone signed in" → the Telegram channel.
 *
 * The channel already carries the contact form; sign-ups are also worth knowing
 * the moment they happen. Volume is the whole risk here, so
 * how much of it gets posted is a setting — see `signInNoticeMode` — and this
 * function is only reached once that gate has said yes.
 *
 * Best-effort in every direction: called from `after()`, so it never delays the
 * sign-in redirect, and every step degrades rather than throws.
 */
export async function notifySignIn(input: {
  user: { email?: string | null; name?: string | null };
  provider: string | null;
  isNewUser: boolean;
  client: ClientReading;
}): Promise<void> {
  const { user, provider, isNewUser, client } = input;

  // "We're at 47" is the number a sign-up is actually interesting for, and it's
  // one cheap COUNT on a table this size. Skipped for returning sign-ins, where
  // it hasn't moved. A failure costs the line, not the post.
  let userCount: number | null = null;
  if (isNewUser) {
    userCount = await db
      .select({ value: count() })
      .from(users)
      .then(([row]) => row?.value ?? null)
      .catch((err) => {
        console.warn("[auth] could not count accounts for the notice:", err);
        return null;
      });
  }

  await sendSignInMessage({
    email: user.email ?? null,
    name: user.name ?? null,
    provider,
    isNewUser,
    city: client.city,
    country: client.country,
    userAgent: client.userAgent,
    userCount,
  });
}
