# Factura

Drop utility-bill PDFs, get a ledger: totals per property and month, missing-bill
detection, per-vendor history. PDFs are parsed in the browser (pdf.js); only the
extracted text is stored — original files are never uploaded or kept.

## Stack

Next.js (App Router) · tRPC · Drizzle ORM · Postgres (Docker) · Tailwind.

## Run it

```bash
cp env.example .env        # adjust if needed
docker compose up -d       # Postgres 17 on localhost:5433
npm install
npm run db:push            # create schema
npm run db:seed            # local user + vendors
npm run dev
```

## How it works

- **Drop a PDF anywhere** on the dashboard. The browser extracts text, the server
  runs vendor parsers (`src/parsers/`) and saves the bill.
- **Accounts** link a vendor account number to a property. The first bill from an
  unknown account asks which property it belongs to — once. Address variants
  (street + number) pre-select the answer.
- **Review inbox** catches unrecognized vendors and failed parses; fill fields
  manually or fix the parser and hit **Reparse** (Playground page) — raw text is
  stored, so bills re-extract without re-dropping files.
- **Playground** (`/debug`) parses a PDF without saving — use it to grab fixture
  text when adding a new vendor parser.

## Adding a vendor parser

1. Drop a bill on `/debug`, copy the raw text, sanitize it (names, addresses,
   account numbers), save as `src/parsers/__fixtures__/<vendor>.txt`.
2. Implement `VendorParser` in `src/parsers/<vendor>.ts`, register it in
   `registry.ts`, add a seed entry for the vendor, write a test.
3. `npm test`, then **Reparse all bills** to backfill.

`samples/` and `docs/` are gitignored — they may contain personal data.
