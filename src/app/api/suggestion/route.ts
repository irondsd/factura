import { CONTACT_SEND, limitKey, take } from "@/server/rateLimit";
import { parseSuggestion } from "@/server/suggestion";
import { sendSuggestionMessage } from "@/server/telegram";

export const runtime = "nodejs";

/** The article suggestion box → the Telegram channel.
 *
 * The same bargain as /api/contact: nothing is stored, delivery is the
 * response (a failed post answers 502 so the box can say so), and an
 * unconfigured environment counts as delivered. Rate-limited on its own key
 * with the contact form's budget, so one can't starve the other. */
export async function POST(request: Request) {
  const limit = take(limitKey(request, "suggestion:send"), CONTACT_SEND);
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

  // Honeypot, as on /contacto: answered like a success, never forwarded.
  const { website } = (body ?? {}) as Record<string, unknown>;
  if (typeof website === "string" && website.trim())
    return Response.json({ ok: true });

  const suggestion = parseSuggestion(body);
  if (!suggestion)
    return Response.json({ error: "Invalid body" }, { status: 400 });

  const { ok } = await sendSuggestionMessage(suggestion);
  if (!ok) return Response.json({ error: "Delivery failed" }, { status: 502 });

  return Response.json({ ok: true });
}
