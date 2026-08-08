import { redirect } from "next/navigation";
import { loginTarget } from "@/lib/nextPath";
import { SHARE_DENIED, SHARE_PARAM } from "@/lib/shareTarget";
import { auth } from "@/server/auth";
import { LoginForm } from "./LoginForm";

/** A repeated query parameter is a malformed request, not a list — take the
 * first so every check below sees a single unambiguous value. */
function one(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

/** The sign-in page, gated on the server so an already-signed-in visitor never
 * loads it at all.
 *
 * Every "Ingresar"/"Comenzar" button on the landing points here rather than at
 * /app, and this is what makes that the right call: the session is resolved
 * before a byte of the form ships, so a signed-in visitor gets a 307 straight
 * to where they were going, while everyone else — the majority arriving from a
 * marketing page — gets the small login card and none of the app's bundle.
 *
 * The cost is that /login is rendered per request instead of prerendered, which
 * buys nothing to lose: it's `disallow`ed in robots.txt and has no SEO value.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  // Where sign-in leads. `next` is what carries a deep link across the flow —
  // /oauth/authorize sets it, so does the app's own auth gate — and `claim` is
  // the flag /probar sets for bills dropped while logged out. loginTarget runs
  // `next` through safeNext, so a hostile ?next= can only land on /app.
  const target = loginTarget(one(resolved.next), one(resolved.claim) === "1");

  const session = await auth();
  if (session?.user) redirect(target);

  return (
    <LoginForm
      callbackUrl={target}
      errorCode={one(resolved.error)}
      // Sent here by the share-target worker, which refuses to stash a bill it
      // has no session to file under. Say so, or landing on a login screen out
      // of the Android share sheet reads as the share having vanished.
      shareDenied={one(resolved[SHARE_PARAM]) === SHARE_DENIED}
    />
  );
}
