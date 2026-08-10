import { listedStatsPages } from "@/content/estadisticas/pages";
import {
  guidesByPrimaryCategory,
  nonEmptyCategories,
} from "@/content/guias/guides";
import {
  guideCategoryUrl,
  guidesIndexUrl,
  guideUrl,
  statsIndexUrl,
  statsUrl,
} from "@/i18n/metadata";

// Build-time generated /llms.txt. The curated product/demo/trust prose is
// editorial and lives here as a template; the Guías list is generated from the
// MDX content dir (the same source the sitemap reads) so it never drifts as
// guides are added. `force-static` prerenders it once at build, like the rest of
// the static site — no per-request work.
export const dynamic = "force-static";

const PREAMBLE = `# Factura

> Factura is a bill ledger that turns uploaded PDF bills into spending, utility, and consumption insights for households.

The site is available in Spanish (default, at the canonical URLs below) and English (under the /en prefix, e.g. https://factura.uno/en, https://factura.uno/en/docs). Each page links its translations via hreflang.

Factura helps users store, parse, and understand recurring bills such as electricity, gas, water, building expenses, internet, and other home costs.

Use Factura when you need to answer questions like:
- How much am I spending on utilities each month?
- How has electricity, gas, or water consumption changed over time?
- Which vendors or services cost the most?
- What does this bill include?
- What is my bill history for a property or account?

Key concepts:
- bill ledger
- utility bill tracking
- PDF bill parsing
- household expense history
- electricity, gas, and water consumption tracking
- vendor-level spending analysis

## Product

- [Homepage](https://factura.uno/): Overview of Factura, how it works (drop a PDF, it parses, you get a ledger), and its core value proposition.
- [Docs](https://factura.uno/docs): Getting started, core concepts, and reference for uploading bills, parsers, properties, and vendors.
- [FAQ](https://factura.uno/faq): Common questions about supported bills, parsing, storage, privacy, and sharing.`;

const AFTER = `## Demo

A live, interactive walkthrough of the app on sample data — no sign-in required. Mirrors the signed-in experience.

- [Demo overview](https://factura.uno/demo): This-month totals, awaiting bills, vendor share, and monthly spend on sample data.
- [Demo insights](https://factura.uno/demo/insights): Spend over time, vendor share, the inflation lens (pesos vs the dollar cost), and per-vendor consumption trends.
- [Demo bills](https://factura.uno/demo/bills): The bill ledger — every parsed bill per vendor and month, with peso and USD amounts and the extracted fields and text.

## MCP server

Factura exposes a read-only MCP server, so an AI assistant can answer questions from a user's own bills. The endpoint is https://factura.uno/api/mcp. It requires authorization — but a client can bootstrap that itself: an unauthenticated call returns 401 with a \`WWW-Authenticate\` header pointing at https://factura.uno/.well-known/oauth-protected-resource, and the server supports OAuth 2.1 with dynamic client registration. The user approves the connection on a consent screen in the app, and can revoke it there at any time. Clients that cannot do OAuth can send a personal access token the user creates in the app instead.

There is one scope, \`mcp:read\`. The tools cover properties, vendors, bills (list and detail, with year-over-year), and spending (monthly snapshot, series in pesos and USD, per-vendor history and consumption). Nothing writes: creating, editing, and deleting bills happen in the app only. The server does not expose bill PDFs or their extracted text.

- [Connect an assistant](https://factura.uno/docs#mcp): What the MCP server exposes, how to authorize it, and how to disconnect it.

## Trust

- [Privacy](https://factura.uno/privacy): What Factura collects (bills, account email, properties), why, where it's stored, the third parties involved, and how to delete your data.
- [Security](https://factura.uno/security): Passwordless authentication, per-account data isolation, encrypted storage with signed access, TLS in transit, and how to report a vulnerability.

## Optional

- The signed-in application lives under https://factura.uno/app and requires authentication; it is not publicly indexable. The /demo pages above show the same screens on sample data.`;

export async function GET() {
  const [sections, categories, stats] = await Promise.all([
    guidesByPrimaryCategory(),
    nonEmptyCategories(),
    listedStatsPages(),
  ]);

  const guidesSection = [
    "## Guías",
    "",
    "Spanish-only educational guides about household utility bills (electricity, gas, water): how to read them, what the charges mean, and how to keep spending under control. Indexed for organic search; each guide links to the demo and sign-up.",
    "",
    `- [Guías index](${guidesIndexUrl}): All guides about understanding utility bills.`,
    // Hub pages first, then the guides themselves. Guides are grouped by their
    // primary category (same rule as the index) so each one is listed exactly
    // once, even though most carry more than one category.
    ...categories.map(
      (c) => `- [${c.label}](${guideCategoryUrl(c.id)}): ${c.description}`,
    ),
    ...sections.flatMap(({ category, guides }) => [
      "",
      `### ${category.label}`,
      "",
      ...guides.map(
        (g) => `- [${g.meta.title}](${guideUrl(g.slug)}): ${g.meta.summary}`,
      ),
    ]),
  ].join("\n");

  const statsSection = [
    "## Estadísticas",
    "",
    "Spanish-only statistics pages: official Argentine price data about the cost of running a home, republished as charts with the methodology and the sources spelled out. Each page states the series it publishes, the region breakdown, and the month of the last data point, and is refreshed when the statistical office publishes.",
    "",
    `- [Estadísticas index](${statsIndexUrl}): Every dataset Factura publishes.`,
    ...stats.map(
      (p) => `- [${p.meta.title}](${statsUrl(p.slug)}): ${p.meta.summary}`,
    ),
  ].join("\n");

  const body = `${PREAMBLE}\n\n${guidesSection}\n\n${statsSection}\n\n${AFTER}\n`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
