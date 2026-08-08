<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Package manager

Use `bun`. `bun.lock` is the tracked lockfile and it's what pins the versions
this project actually runs on. Fall back to `npm` only when `bun` isn't
installed on the machine — and when you do, don't commit the
`package-lock.json` it leaves behind: npm resolves the caret ranges in
`package.json` independently of `bun.lock`, so a stray npm lockfile pins a
second, conflicting set of versions.

# Verifying changes

Always compile first: `build`, `lint`, `typecheck`, and `test`. That is the
floor, not the finish line — if a change is observable in a browser, run it and
look at it rather than handing the user a diff and a promise.

Public / unauthenticated pages you can just open. `/app/*` needs a session, and
you can sign yourself in — see below — so "it's behind auth" is not a reason to
skip runtime verification. Hand off to the user only for what the sign-in below
genuinely can't reach.

## Signing in as an agent

Local dev runs without `RESEND_API_KEY`, and `sendOtpEmail` prints the one-time
code to the server console instead of mailing it. That is the whole trick: you
can drive the real sign-in flow end to end.

1. Start the dev server (port 4000) and make sure the Postgres container is up
   (`docker compose ps`; `docker compose up -d db` if not).
2. Open `/login`, choose "Ingresar con correo", and submit an address you own as
   the agent — use `claude@example.com` so agent-made accounts are obvious in
   the local DB. Any address works; nothing is actually sent.
3. Read the code out of the dev server's log:
   `[email] RESEND_API_KEY unset — OTP for claude@example.com: 145848`
4. Enter the six digits. You land on `/app` with a real session.

First sign-in creates the account, one property called "Home", and adopts the
official parsers, so `/app`, `/app/properties`, `/app/parsers`, `/app/builder`,
`/app/profile`, and `/app/sessions` are all immediately worth looking at.

Note the browser tooling may report a `0x0` viewport, which makes coordinate
clicks land nowhere. `form_input` against a `ref` from `read_page` works
regardless; for buttons, `requestSubmit()` or `.click()` via the JS console is a
reliable fallback.

## Filling an empty account

A fresh agent account has no bills, so anything that reads real data — the
dashboard totals, `/app/insights`, forecasts, the bill drawer, monthly reports,
vendor colours on real rows — renders its empty state and proves nothing. Ingest
the sample bill the repo ships to get past that:

```
TOKEN=$(docker compose exec -T db psql -U factura -d factura -tAc \
  "select s.session_token from session s join users u on u.id = s.user_id \
   where u.email = 'claude@example.com' order by s.expires desc limit 1;" | tr -d '[:space:]')
curl -s -X POST http://localhost:4000/api/bills/ingest \
  -H "Cookie: authjs.session-token=$TOKEN" \
  -F "file=@public/samples/edesur-ejemplo.pdf;type=application/pdf"
```

That returns a parsed Edesur bill and it shows up in the ledger. Repeat with
other PDFs to build up history. Reading the session token straight out of the
local DB is fine *because it is the local DB* — never do this against
`.env.prod`, and never point any of this at the production database.

## What still needs the user

Anything the steps above can't reach on a local, single-user account: Google
sign-in, real transactional email, shared apartments and invites (needs a second
real account), R2/production storage behaviour, and anything depending on their
actual bill history. Say plainly which parts you verified and which you didn't.
