import { isLocale, type Locale } from "@/i18n/config";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
} from "@/lib/limits";
import { CONTACT_SEND, limitKey, take } from "@/server/rateLimit";
import { sendContactMessage } from "@/server/telegram";

export const runtime = "nodejs";

/** Topics the form offers, and the label each one gets in the channel post.
 *
 * The ids are what travels — they're locale-independent, which is why the
 * select submits one rather than the label a visitor read — and these labels
 * are deliberately English and fixed: the post is read by us, in one language,
 * whichever language the form was filled in. */
const TOPICS: Record<string, string> = {
  support: "Support",
  bill: "Misread bill",
  privacy: "Privacy & data",
  idea: "Idea / suggestion",
  other: "Other",
};

type ContactBody = {
  topic: string;
  name: string | null;
  email: string;
  message: string;
  locale: Locale | null;
};

/** Validate the posted body into a message, or `null` if it isn't one.
 *
 * Deliberately strict about the two fields a reply depends on (a reachable
 * address, a message with something in it) and forgiving about the rest: an
 * unknown topic becomes "other" rather than costing someone the text they
 * typed. */
function parse(body: unknown): ContactBody | null {
  const { topic, name, email, message, locale } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof email !== "string" || typeof message !== "string") return null;

  const address = email.trim();
  // Not an RFC validator, and not trying to be — the address is only ever used
  // as a reply-to for a human, so the check is "could this be one".
  if (!address.includes("@") || address.length > CONTACT_EMAIL_MAX) return null;

  const text = message.trim();
  if (text.length < CONTACT_MESSAGE_MIN || text.length > CONTACT_MESSAGE_MAX)
    return null;

  return {
    topic:
      typeof topic === "string" && topic in TOPICS
        ? TOPICS[topic]
        : TOPICS.other,
    name:
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, CONTACT_NAME_MAX)
        : null,
    email: address,
    message: text,
    locale: typeof locale === "string" && isLocale(locale) ? locale : null,
  };
}

/** The /contacto form → the Telegram channel.
 *
 * Delivery is the response: a failed post answers 502 so the page can say so
 * and point at support@factura.uno, rather than thanking someone for a message
 * that went nowhere. An unconfigured environment (no bot token, i.e. local dev)
 * counts as delivered — see `sendTelegramMessage`.
 *
 * Nothing is stored in the database on purpose. A public endpoint that writes
 * rows is a spam surface with a cleanup job attached, and the channel is
 * already the durable copy. */
export async function POST(request: Request) {
  const limit = take(limitKey(request, "contact:send"), CONTACT_SEND);
  if (!limit.ok)
    return Response.json(
      { error: "Too many requests", retryAfterSec: limit.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  // Honeypot: a field no human sees and every naive bot fills in. Answered with
  // the same `ok` a real submission gets — a bot told it failed just retries —
  // and never forwarded.
  const { website } = (body ?? {}) as Record<string, unknown>;
  if (typeof website === "string" && website.trim())
    return Response.json({ ok: true });

  const contact = parse(body);
  if (!contact)
    return Response.json({ error: "Invalid body" }, { status: 400 });

  const { ok } = await sendContactMessage(contact);
  if (!ok) return Response.json({ error: "Delivery failed" }, { status: 502 });

  return Response.json({ ok: true });
}
