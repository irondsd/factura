import { redirect } from "next/navigation";
import { Display, Eyebrow } from "@/components/charts/primitives";
import { Button } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { interpolate } from "@/i18n/config";
import { db } from "@/db";
import { auth } from "@/server/auth";
import { checkAuthorizeRequest, redirectBack } from "@/server/mcp/authorize";
import { mcpResourceUrl } from "@/server/mcp/config";
import { findClient } from "@/server/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The OAuth authorization endpoint, and the only screen in this whole feature
 * a person ever reads.
 *
 * Everything an MCP client is about to be able to see passes through one press
 * of one button here, so the screen is built around two questions the user
 * actually needs answered: who is asking, and what will they get. The honest
 * answer to the second one includes the part that is easy to leave out — that
 * the data travels to the client's servers as soon as it is read.
 *
 * On the first question, `client_name` is worth distrusting. It comes from an
 * open registration endpoint, so anyone can register "Factura Official" and
 * point it at their own callback. React escapes it, so this is not an injection
 * risk; it is an impersonation one. The defence is the callback host shown
 * beneath it — that value is exact-matched against the registration on the way
 * in and on the way out, so it is the one string on this page that cannot be
 * anything other than where the data will actually go.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getI18n();
  const tc = t.consent;
  const resolved = await searchParams;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    // A repeated parameter is a malformed request, not a list; take the first
    // so the checks below see a single unambiguous value.
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined)
      query.set(key, value[0]);
  }

  // Validate the request BEFORE asking who is reading it. A request that can
  // never succeed — unregistered client, unregistered redirect_uri, a challenge
  // method we don't accept — is broken no matter who is signed in, and making
  // someone authenticate first only to be told "this application is not
  // registered" demands a password for nothing. It also means a misconfigured
  // client gets its `error=` back immediately instead of after a login round
  // trip it cannot use.
  //
  // Nothing here is leaked by checking first: a client_id travels in the clear
  // in every authorization URL, and a redirect_uri is a value the client itself
  // registered.
  const clientId = query.get("client_id");
  const client = clientId ? ((await findClient(db, clientId)) ?? null) : null;
  const check = checkAuthorizeRequest(query, client, mcpResourceUrl());

  if (!check.ok) {
    // Reportable failures go back to the client, which can tell the user what
    // it did wrong far better than this page can. Fatal ones stop here — the
    // redirect target is exactly what we could not verify.
    if (!check.fatal) {
      redirect(
        redirectBack(check.redirectUri, check.state, {
          error: check.error,
          error_description: check.description,
        }),
      );
    }
    return (
      <ConsentError
        title={tc.problem}
        help={tc.problemHelp}
        detail={check.description}
      />
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    // Sign in, then come back to this exact request. `safeNext` on the login
    // side is what makes handing it a path safe.
    const here = `/oauth/authorize?${query.toString()}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const { params } = check;
  // Non-null: a null client is a fatal check above.
  const app = client!;
  const callbackHost = hostOf(params.redirectUri);

  return (
    <div className="mx-auto max-w-[34rem] px-5 pt-12 pb-20">
      <Eyebrow>{tc.eyebrow}</Eyebrow>
      <Display size={30} className="block mt-1.5">
        {interpolate(tc.title, { app: app.name })}
      </Display>

      <div className="mt-6 border border-line bg-card p-[18px]">
        <p className="font-display font-semibold text-[15px] tracking-tight">
          {app.name}
        </p>
        <p className="font-mono text-micro text-muted mt-1">
          {interpolate(tc.callback, { host: callbackHost })}
        </p>
        <p className="font-mono text-micro text-muted mt-3 leading-[1.6]">
          {tc.unverified}
        </p>
      </div>

      <h2 className="mt-8 mb-2">
        <Eyebrow>{tc.willBeAbleTo}</Eyebrow>
      </h2>
      <ul className="font-mono text-xs text-muted leading-[1.9] list-none pl-0">
        {tc.permissions.map((line: string) => (
          <li key={line} className="before:content-['·'] before:mr-2">
            {line}
          </li>
        ))}
      </ul>

      <p className="font-mono text-xs text-muted mt-5 max-w-[480px] leading-[1.6]">
        {tc.dataLeaves}
      </p>
      <p className="font-mono text-xs text-muted mt-3 max-w-[480px] leading-[1.6]">
        {tc.readOnly}
      </p>
      <p className="font-mono text-xs text-muted mt-3 max-w-[480px] leading-[1.6]">
        {tc.revocable}
      </p>

      {/* A plain form to a route handler: no JS on the page, and the browser's
          own navigation carries the decision. The hidden fields are re-validated
          server-side against the registration — see the note on the handler. */}
      <form
        method="POST"
        action="/api/oauth/authorize"
        className="mt-8 flex gap-3"
      >
        <input type="hidden" name="client_id" value={params.clientId} />
        <input type="hidden" name="redirect_uri" value={params.redirectUri} />
        <input
          type="hidden"
          name="code_challenge"
          value={params.codeChallenge}
        />
        <input type="hidden" name="code_challenge_method" value="S256" />
        <input type="hidden" name="response_type" value="code" />
        <input type="hidden" name="scope" value={params.scope} />
        {params.state !== null && (
          <input type="hidden" name="state" value={params.state} />
        )}
        {params.resource !== null && (
          <input type="hidden" name="resource" value={params.resource} />
        )}
        <Button type="submit" name="decision" value="allow" variant="solid">
          {tc.allow}
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline">
          {tc.deny}
        </Button>
      </form>
    </div>
  );
}

/** The dead end: a request that cannot be reported back to the client, because
 * the redirect target is the very thing that failed validation.
 *
 * Two registers on purpose. `help` is the localized sentence a person can act
 * on — which is "you can't, tell the developer" — and `detail` is the OAuth
 * error text, which stays in English because it is the same string the spec
 * puts in `error_description` and the person who needs it is reading a client's
 * logs, not this page. Presenting it as a technical aside rather than as the
 * explanation is what keeps the page honest about which half is for whom. */
function ConsentError({
  title,
  help,
  detail,
}: {
  title: string;
  help: string;
  detail: string;
}) {
  return (
    <div className="mx-auto max-w-[34rem] px-5 pt-12 pb-20">
      <Eyebrow tone="accent">{title}</Eyebrow>
      <p className="font-mono text-xs text-muted mt-3 max-w-[460px] leading-[1.6]">
        {help}
      </p>
      <p className="font-mono text-xs text-ink mt-3 border-l-2 border-line pl-3 leading-[1.6]">
        {detail}
      </p>
    </div>
  );
}

/** Host of the callback, for display. The URI is already known-registered by
 * the time this runs, so the fallback is for private schemes like `cursor://`
 * that have no host at all — those show the scheme instead, which is still the
 * truthful answer to "where does this go". */
function hostOf(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || url.protocol.replace(/:$/, "");
  } catch {
    return uri;
  }
}
