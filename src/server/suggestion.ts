import {
  CONTACT_EMAIL_MAX,
  SUGGESTION_MESSAGE_MAX,
  SUGGESTION_MESSAGE_MIN,
} from "@/lib/limits";
import type { SuggestionMessage } from "@/server/telegram";

// Validation for /api/suggestion, kept out of the route file: Next allows a
// route module to export only its handlers and config.

/** Longest page path worth quoting back. Article paths are a section, maybe a
 * category and a slug; anything much longer is not one of ours. */
const PATH_MAX = 300;

/** Validate the posted body into a suggestion, or `null` if it isn't one.
 *
 * Strict only about the message. The address is optional — a suggestion with
 * no way to answer it is still worth reading — so a malformed one is dropped
 * rather than costing the reader what they typed. The path is only ever
 * printed as a link in our own channel, so it is kept to a site-relative path:
 * a leading `/`, not `//` (protocol-relative), nothing but URL characters. */
export function parseSuggestion(body: unknown): SuggestionMessage | null {
  const { message, email, path } = (body ?? {}) as Record<string, unknown>;

  if (typeof message !== "string") return null;
  const text = message.trim();
  if (text.length < SUGGESTION_MESSAGE_MIN || text.length > SUGGESTION_MESSAGE_MAX)
    return null;

  const address = typeof email === "string" ? email.trim() : "";
  const validAddress =
    address.includes("@") && address.length <= CONTACT_EMAIL_MAX;

  const page =
    typeof path === "string" &&
    path.length <= PATH_MAX &&
    /^\/(?!\/)[\w\-./~%]*$/.test(path)
      ? path
      : null;

  return {
    message: text,
    email: validAddress ? address : null,
    path: page,
  };
}
