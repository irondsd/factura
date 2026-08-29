# Factura — site and CMS

This repository contains the public website and publishing system for
[factura.uno](https://factura.uno). The signed-in product is a separate project,
served from [app.factura.uno](https://app.factura.uno).

## What lives here

- The Spanish and English marketing pages, public demo, documentation, FAQ,
  privacy, security, and contact pages.
- Published guides, statistics, investigations, news, and normativa pages.
- The private `/cms` authoring and media interface, plus its CMS-only MCP API.
- `/probar`, whose browser client sends bill samples to the app origin's API.
- Shared Auth.js sign-in, callback, session-cookie, and logout endpoints.
- Permanent compatibility redirects from legacy product URLs such as `/app/*`,
  `/api/mcp`, and `/api/oauth/*` to the app origin.
- The authoritative Drizzle schema and migrations shared by both deployments.

This repository does not contain the product dashboard, bill APIs, parser
engine, product MCP/OAuth implementation, private bill storage, or PWA runtime.
`/sw.js` is intentionally retained as a small retirement worker so browsers
that installed the former monolith can clear its share cache and unregister it.

## Stack

[Next.js 16](https://nextjs.org) (App Router), React 19, Tailwind CSS 4,
[Drizzle ORM](https://orm.drizzle.team), Postgres, Auth.js, Recharts,
React Email/Resend, and S3-compatible public CMS media storage.

## Quick start

Requires Bun and Docker.

```bash
git clone <your-fork-url> factura
cd factura
cp env.example .env.local
bun install
docker compose up -d
bun run db:push
bun run dev
```

The site runs at `http://localhost:4000`; the documented neighboring app runs at
`http://localhost:4001`.

Email sign-in works locally without Resend: leave `RESEND_API_KEY` blank and the
one-time code is printed to the server console. Add Google OAuth credentials to
enable “Continue with Google.”

## Project layout

```text
src/app/             public routes, login/logout, CMS routes, retained APIs
src/components/      marketing, editorial, demo, chart, and shared UI
src/cms/             CMS domain and public-media management
src/content-system/  content repository, rendering, validation, and metadata
src/db/              shared Drizzle schema
src/server/          identity, contact notifications, rate limits, CMS protocol
emails/              OTP and welcome React Email templates
scripts/             SEO audit, public datasets, CMS media, and DB utilities
```

Public articles are stored in Postgres and authored through `/cms` or the
`factura-cms` MCP server. Read `src/content/AUTHORING.md` before editing content.

## Configuration

Copy `env.example` to `.env.local`.

| Variable                                                                                          | Purpose                                                        |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                                                                                    | Shared Postgres connection string.                             |
| `NEXT_PUBLIC_SITE_URL`                                                                            | Canonical marketing origin.                                    |
| `NEXT_PUBLIC_APP_URL`                                                                             | Canonical app origin used by links, redirects, and allowlists. |
| `AUTH_SECRET`                                                                                     | Auth.js session secret.                                        |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                                           | Google OAuth; optional in development.                         |
| `SESSION_COOKIE_DOMAIN`                                                                           | Production cookie domain shared with `app.factura.uno`.        |
| `RESEND_API_KEY` / `EMAIL_FROM`                                                                   | OTP and welcome email delivery.                                |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHANNEL_ID`                                                      | Contact-form and optional sign-up notices.                     |
| `TELEGRAM_NOTIFY_SIGNINS`                                                                         | `new` by default, `all`, or `off`.                             |
| `CMS_MEDIA_S3_BUCKET` / `CMS_MEDIA_PUBLIC_ORIGIN`                                                 | Public CMS media bucket and browser origin.                    |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_FORCE_PATH_STYLE` | S3-compatible connection used by CMS media.                    |

The two public origin variables are deliberately distinct: one names this site
and one names the app. Server-only and browser-visible code derive from the same
pair, so links and security allowlists cannot drift.

## Commands

```bash
bun run dev          # development server on :4000
bun run build        # production build
bun run start        # serve the production build
bun run lint         # ESLint
bun run typecheck    # TypeScript
bun run test         # Vitest
bun run audit:seo    # audit built public SEO output
bun run db:push      # push the shared Drizzle schema
bun run db:studio    # inspect the shared database
bun run email        # preview email templates on :3001
```

Public-data and CMS-media maintenance commands are listed in `package.json`.

## License

[MIT](LICENSE) © Konstantin Mednikov
