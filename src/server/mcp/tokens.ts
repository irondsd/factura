import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Secrets for everything that can hold a key to an account from outside the
 * browser: personal access tokens, OAuth access and refresh tokens, and the
 * one-shot authorization codes in between.
 *
 * Pure and clock-free on purpose — the DB-touching half lives in ./oauth.ts, so
 * the parts worth being sure about (prefix routing, PKCE, hashing) are directly
 * unit-testable. Same split the rest of src/server uses.
 */

/** Bytes of entropy behind every secret minted here. 32 bytes = 256 bits, which
 * is the number that makes plain SHA-256 storage and non-constant-time database
 * lookups fine: there is nothing to guess and nothing to narrow down. */
const SECRET_BYTES = 32;

/** Which table a bearer string belongs to, readable without touching the
 * database. The prefix is not a security boundary — a forged one just misses in
 * the table it routes to — it exists so one lookup can be skipped and so a
 * leaked token is greppable and identifiable in a log or a support screenshot. */
export const TOKEN_PREFIX = {
  /** Personal access token, minted by hand on the connections page. */
  personal: "fct_pat_",
  /** OAuth access token: presented on every MCP call, short-lived. */
  access: "fct_at_",
  /** OAuth refresh token: presented only at the token endpoint. */
  refresh: "fct_rt_",
} as const;

export type TokenKind = keyof typeof TOKEN_PREFIX;

/** How long an OAuth access token stays valid. Short, because the refresh token
 * is what carries the connection: an access token that leaks out of a client's
 * memory or a proxy log stops working within the hour, while the user's
 * connection survives untouched. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

/** How long a refresh token stays valid without being used. Long enough that a
 * client the user hasn't opened in a month still reconnects silently; short
 * enough that an abandoned connection eventually stops being a live credential.
 * Rotation resets it, so an actively used connection never expires. */
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** How long an authorization code is good for. Deliberately tiny: the code goes
 * through a browser redirect and is exchanged immediately, so anything beyond a
 * minute or two is a window with no use except to an attacker holding a URL out
 * of somebody's history or Referer header. */
export const AUTH_CODE_TTL_MS = 2 * 60 * 1000;

/** A freshly minted secret: the string to hand over exactly once, the digest to
 * store, and the tail to show in a list afterwards. */
export type MintedToken = {
  /** The full bearer string. This is the only moment it exists in the clear. */
  token: string;
  /** SHA-256 hex of `token` — what goes in the database. */
  hash: string;
  /** Last few characters, for telling several tokens apart in the UI. */
  hint: string;
};

/** SHA-256 hex of a bearer string.
 *
 * Not a password hash and not meant to be one: see the note in the schema. The
 * inputs are 256-bit random values, so there is no dictionary to run and a work
 * factor would only slow down the legitimate lookup on every single MCP call. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintToken(kind: TokenKind): MintedToken {
  const token =
    TOKEN_PREFIX[kind] + randomBytes(SECRET_BYTES).toString("base64url");
  return { token, hash: hashToken(token), hint: token.slice(-4) };
}

/** An opaque, single-use authorization code. Carries no prefix: it never leaves
 * the redirect it was minted for, and is never presented as a bearer token. */
export function mintAuthCode(): { code: string; hash: string } {
  const code = randomBytes(SECRET_BYTES).toString("base64url");
  return { code, hash: hashToken(code) };
}

/** A public `client_id` for a newly registered client. Random rather than
 * sequential so the registration table's size isn't public information. */
export function mintClientId(): string {
  return `fct_client_${randomBytes(16).toString("base64url")}`;
}

/** Which kind of bearer string this is, by prefix. Null for anything that
 * doesn't carry one of ours — including a well-formed token from a different
 * deployment, which must miss rather than be looked up. */
export function tokenKind(token: string): TokenKind | null {
  for (const [kind, prefix] of Object.entries(TOKEN_PREFIX)) {
    if (token.startsWith(prefix)) return kind as TokenKind;
  }
  return null;
}

/** The token out of an `Authorization: Bearer …` header, or null.
 *
 * The scheme match is case-insensitive because RFC 7235 says it is, and clients
 * do send "bearer". Everything after the scheme is returned verbatim: trimming
 * or unquoting it would only mask a malformed client. */
export function bearerFromHeader(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** PKCE S256: does this verifier hash to the challenge recorded at /authorize?
 *
 * S256 only. OAuth 2.1 removes `plain`, and accepting it would defeat the point
 * of PKCE entirely — anyone who intercepted the authorization request would have
 * the verifier too. A client that asks for `plain` is rejected upstream at
 * /authorize rather than silently downgraded here.
 *
 * Constant-time compare: unlike the token hashes above, a verifier is compared
 * against a value an attacker chose and can iterate on, so the byte-by-byte
 * early exit of `===` is worth avoiding on principle even though the window is
 * narrow. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  // RFC 7636 bounds the verifier at 43–128 characters; anything outside that is
  // malformed, and checking it first keeps a huge body from being hashed.
  if (verifier.length < 43 || verifier.length > 128) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  // timingSafeEqual throws on a length mismatch, which is itself the answer.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Has this expiry passed? Null means "never expires", which only personal
 * tokens are allowed to be. */
export function isExpired(
  expires: Date | null,
  now: number = Date.now(),
): boolean {
  return expires !== null && expires.getTime() <= now;
}
