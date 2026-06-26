# Factura

**Drop a utility-bill PDF, get a ledger.** Factura reads your bills, pulls out the
vendor, account, billing period and amount, and keeps a running total per
property and month — with missing-bill detection, per-vendor history, and
ARS/USD insights.

It's self-hostable and built around a **config-driven parser engine**: parsers
are pure data, not code, so you can teach Factura a new vendor's bill format in a
visual builder and share it — no fork required.

> **Privacy.** PDF text is extracted in your browser. The bill (extracted text
> plus the original PDF) is then stored privately to your account so it can be
> viewed and re-parsed later. Bills are scoped to your account — only you can
> see them.

## Features

- **Drop-to-ingest** — drop a PDF anywhere on the dashboard; Factura extracts the
  text in-browser, stores the file, and files the bill into your ledger.
- **Property ledger** — totals per property and month, per-vendor history, and
  detection of months that are missing a bill.
- **Insights** — charts for spend over time and by vendor, with a per-chart
  ARS/USD toggle.
- **Accounts → properties** — the first bill from an unknown account asks which
  property it belongs to, once; address variants pre-select the answer.
- **Shared properties** — invite members to a property so co-owners or tenants
  share the same ledger.
- **Review inbox** — unrecognized vendors and failed parses land here; fix the
  fields by hand, or fix the parser and re-parse. Raw text is stored, so bills
  re-extract without re-dropping files.
- **Config-driven parser engine** — vendor-agnostic by construction; a parser is
  JSON-serializable data the engine interprets (region slicing → captures →
  compute → validation → field roles).
- **Visual parser builder** (`/builder`) — build and test a parser against a real
  bill without writing code.
- **Parser registry** — keep your own parsers, adopt official/community ones, and
  publish or fork them.
- **Auth** — Google OAuth and email one-time-password sign-in.

## Stack

[Next.js 16](https://nextjs.org) (App Router) · [tRPC](https://trpc.io) ·
[Drizzle ORM](https://orm.drizzle.team) · Postgres ·
[NextAuth v5](https://authjs.dev) · [Tailwind v4](https://tailwindcss.com) ·
[Recharts](https://recharts.org) · S3-compatible storage (MinIO / R2 / S3) ·
[Resend](https://resend.com) for email.

## Quick start

Requires Node 20+ and Docker.

```bash
git clone <your-fork-url> factura && cd factura

cp env.example .env.local   # see Configuration below
docker compose up -d        # Postgres on :5433, MinIO on :9000 (console :9001)
npm install
npm run db:push             # create the schema
npm run db:seed             # local user + starter vendors
npm run dev                 # http://localhost:4000
```

Auth and email work out of the box in dev without external accounts: leave
`RESEND_API_KEY` blank and sign-in codes are printed to the server console
instead of being emailed. Add Google OAuth credentials to enable
"Continue with Google".

## How it works

1. **Drop a PDF anywhere** on the dashboard. The browser extracts the text
   (`react-pdftotext`); the original file is uploaded to S3-compatible storage
   (when configured) and the extracted text is sent to the server.
2. The server runs the **parser engine** over the text. A matching parser yields
   a structured bill (vendor, account, period, amount) that's saved to your
   ledger. No match → the **review inbox**; a partial match → a manual-fix queue.
3. Because the **raw text is stored**, bills can be **re-parsed** on the server
   after you improve a parser — no need to re-drop the files.

## Parsers

Parsers are **data, not code**. A `ParserConfig` (`src/parsers/engine/types.ts`)
describes a pipeline the engine interprets, and nothing in it names a vendor or
country — locale lives in transform params (`numberAR` vs `numberUS`), never in
identifiers.

There are three ways to add one:

- **Visual builder** (`/builder`) — drop a bill, define captures and field roles
  against the live text, test, and save. This is the recommended path.
- **Registry** — adopt a published parser for a vendor someone has already
  mapped, or fork one that's close.
- **In code** — the seed parsers live under `src/parsers/engine/configs/`, with
  sanitized sample bills in `src/parsers/__fixtures__/` and tests alongside the
  engine. Useful when you want the parser checked into the repo.

After changing a parser, **re-parse** affected bills to backfill them.

## Project layout

```
src/
  app/            # Next.js App Router pages (insights, bills, properties,
                  #   parsers, builder, profile, login, api)
  components/     # UI — DropOverlay (drop-to-ingest), charts, app shell
  server/         # tRPC routers, storage (S3), parser registry, auth
  parsers/
    engine/       # the config-driven engine + seed configs
    builder/      # builder-page logic (config <-> editable model)
    __fixtures__/ # sanitized sample bill text for tests
  db/             # Drizzle schema + seed
emails/           # React Email templates (welcome, sign-in code, invites)
```

## Configuration

Copy `env.example` to `.env.local`. The defaults match `docker-compose.yml`, so
local dev needs no edits.

| Variable                                                                                                        | Purpose                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                  | Postgres connection string.                                                         |
| `AUTH_SECRET`                                                                                                   | Session/JWT secret (`npx auth secret`).                                             |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                                                         | Google OAuth; optional in dev.                                                      |
| `RESEND_API_KEY` / `EMAIL_FROM`                                                                                 | Transactional email; blank in dev logs sign-in codes to the console.                |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_FORCE_PATH_STYLE` | Storage for original PDFs. Leave blank to run text-only (no PDF upload / View PDF). |

## Scripts

```bash
npm run dev          # dev server on :4000
npm run build        # production build
npm run start        # serve the production build
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write .
npm run db:push      # push the Drizzle schema
npm run db:seed      # seed local user + vendors
npm run db:studio    # Drizzle Studio
npm run email        # preview email templates on :3001
```

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
npm run typecheck && npm test && npm run lint
```

New vendor parsers are especially welcome — build one in `/builder`, add a
sanitized fixture and a test, and open a PR. Please keep sample bills free of
real names, addresses, and account numbers.

## License

[MIT](LICENSE) © Konstantin Mednikov
