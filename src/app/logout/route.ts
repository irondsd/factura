import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { logoutTarget } from "@/lib/nextPath";
import { SESSION_COOKIE_NAMES, sessionCookieConfig } from "@/server/authCookie";

/**
 * Canonical logout for both deployments.
 *
 * The active database session is revoked before both possible Auth.js cookie
 * names are expired. `sessionCookieConfig` is the same source the login handler
 * uses, so Domain, Path, SameSite and Secure cannot drift between issuance and
 * deletion. The destination is allowlisted before it reaches the response.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const next = new URL(request.url).searchParams.get("next");
  const tokens = SESSION_COOKIE_NAMES.flatMap((name) => {
    const token = request.cookies.get(name)?.value;
    return token ? [token] : [];
  });

  for (const token of new Set(tokens)) {
    await db.delete(sessions).where(eq(sessions.sessionToken, token));
  }

  // NextResponse requires an absolute URL. `logoutTarget` deliberately keeps
  // relative same-origin returns for monolith/local compatibility, so resolve
  // that result against the request before handing it to Next.
  const destination = new URL(logoutTarget(next), request.url);
  const response = NextResponse.redirect(destination, 303);
  const { options } = sessionCookieConfig();
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    });
  }
  return response;
}
