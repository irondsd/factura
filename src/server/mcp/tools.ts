import "server-only";
import { z } from "zod";
import { db } from "@/db";
import { appRouter } from "../root";

/** The tools an MCP client can call, and the one place that decides what a
 * model is allowed to see.
 *
 * Every tool runs through the app's own tRPC router with the caller's `userId`,
 * so property scoping, membership checks and the shared-apartment rules apply
 * exactly as they do in the browser. There is no second data path here and
 * there must never be one: a tool that queried the database directly would be a
 * second implementation of "what may this user see", and the two would drift.
 *
 * Read-only, on purpose. Every procedure below is a `query`; not one mutation
 * is exposed. A model that misreads "how much was the water bill?" and deletes
 * it is a worse first impression of this feature than any missing capability,
 * and write tools can be added later once the read path has been lived with.
 */

type Caller = ReturnType<typeof appRouter.createCaller>;

/** Build a tRPC caller for an MCP request.
 *
 * `sessionToken` is null because there is no browser session behind this call —
 * only the sessions router reads it, and only to protect the current browser
 * from revoking itself, which cannot arise here. */
export function callerFor(userId: string): Caller {
  return appRouter.createCaller({ db, userId, sessionToken: null });
}

export type ToolDefinition<Schema extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  schema: Schema;
  run: (caller: Caller, input: z.infer<Schema>) => Promise<unknown>;
};

function defineTool<Schema extends z.ZodType>(
  tool: ToolDefinition<Schema>,
): ToolDefinition {
  return tool as unknown as ToolDefinition;
}

// ── What leaves the building ────────────────────────────────────────────────

/** A bill, reduced to what a model can actually use.
 *
 * The omissions are the point, and each is deliberate:
 *
 *   • `rawText` — the entire extracted document: service address, meter number,
 *     account number, sometimes a name. It is the largest concentration of
 *     personal data in the schema, it would land in a conversation transcript
 *     on a third party's servers, and nothing a user asks an assistant about
 *     their spending needs it. Left out entirely rather than put behind a flag,
 *     because a flag is a thing a model can decide to set.
 *   • `downloadUrl` — a presigned S3 link. That is a bearer credential for the
 *     PDF: anyone holding the string can fetch the file, with no session and no
 *     login, until it expires. It must not be pasted into a conversation.
 *   • `storageKey`, `textHash`, `createdBy` — internal identifiers that mean
 *     nothing to a model and only invite it to reason about them.
 *   • `fileName` — looks harmless and is not. Vendors name their PDFs after the
 *     service address ("Bme._Mitre_2501_-_4__A_-_Cupon_pago_2026-08.pdf"), so
 *     this field leaks the same thing `rawText` was excluded for, through a
 *     side door. A bill is identified to a model by its period and vendor, not
 *     by a storage filename.
 *   • `extra.accountNumber` — the customer's account identity at the utility,
 *     which is what the parser writes there (see ParsedResult.identity). Only
 *     `extra.fields` is passed through: that half is the parser's structured
 *     numeric extraction (consumption, meter readings, the ordinary/
 *     extraordinary split) and is genuinely what "why was this month higher?"
 *     needs. Allowlisting the useful half rather than blocklisting the known-
 *     bad one also means a future parser inventing a new identity-ish key does
 *     not silently start leaking it.
 *
 * `totalAmount` becomes a number because the database returns numerics as
 * strings, and a model comparing "1500.00" to "890.00" as strings gets it
 * wrong.
 */
function billForModel(bill: Record<string, unknown>) {
  const amount = bill.totalAmount;
  const extra = bill.extra;
  const fields =
    extra && typeof extra === "object" && "fields" in extra
      ? (extra as { fields: unknown }).fields
      : null;
  return {
    id: bill.id,
    period: bill.period,
    dueDate: bill.dueDate,
    totalAmount: typeof amount === "string" ? Number(amount) : (amount ?? null),
    currency: bill.currency,
    status: bill.status,
    vendorId: bill.vendorId,
    propertyId: bill.propertyId,
    accountId: bill.accountId,
    parserKey: bill.parserKey,
    fields,
    createdAt: bill.createdAt,
  };
}

/** The overview, reshaped from the screen's payload into the model's.
 *
 * The router serves a chart: two parallel currency trees, a per-vendor series
 * per currency, a month-switcher list going back to the first bill, and CSS
 * variables for vendor colours. Passed through verbatim that is 30 KB — roughly
 * eight thousand tokens — for one tool call, most of it scaffolding a model
 * cannot use and pays for on every question.
 *
 * This keeps the numbers and drops the drawing instructions: one row per month
 * with both currencies side by side, one row per vendor, and the forecast for
 * what has not arrived yet. Around a tenth of the size, and easier to reason
 * over besides — a model comparing two currencies reads a table better than two
 * trees. Typed against the router's own output, so a change to the overview
 * breaks this at compile time instead of silently emptying it. */
type Overview = Awaited<ReturnType<Caller["insights"]["overview"]>>;

function overviewForModel(o: Overview) {
  const ars = o.byCurrency.ARS;
  const usd = o.byCurrency.USD;
  const nameOf = new Map(o.vendors.map((v) => [v.id, v.displayName]));
  const usdShare = new Map(usd.share.map((s) => [s.vendorId, s.value]));
  const windowTotal = ars.share.reduce((sum, s) => sum + s.value, 0);

  return {
    property: o.property?.nickname ?? null,
    month: o.month,
    isCurrentMonth: o.isCurrentMonth,
    /** True once every bill due this month has arrived. */
    closed: o.closed,
    billsIn: o.billsIn,
    billsExpected: o.billsExpected,
    thisMonthTotal: o.thisMonthTotal,
    thisMonthUsd: o.thisMonthUsd,
    expectedTotal: o.expectedTotal,
    /** Last twelve months, both currencies. `complete` false means bills for
     * that month are still missing, so the total understates it. */
    trend: o.months.map((month, i) => ({
      month,
      ars: ars.series[i]?.total ?? null,
      usd: usd.series[i]?.total ?? null,
      complete: o.completeFlags[i] ?? false,
    })),
    /** Each vendor's total across the window above, biggest first.
     *
     * `vendorId` is not decoration. Vendors belong to a property, so an account
     * with two homes has two rows called "Edesur" — the name alone cannot tell
     * them apart, and a model summing them would double-count one supplier that
     * is really two. The id disambiguates, and it is also what vendor_spending
     * takes, so the two tools chain without a guess in between. */
    byVendor: ars.share
      .map((s) => ({
        vendorId: s.vendorId,
        vendor: nameOf.get(s.vendorId) ?? "Unknown",
        ars: s.value,
        usd: usdShare.get(s.vendorId) ?? null,
        sharePct: windowTotal > 0 ? (s.value / windowTotal) * 100 : null,
      }))
      .sort((a, b) => b.ars - a.ars),
    /** Bills due this month that have not arrived, with the forecast for each.
     * `expectedLow`/`expectedHigh` bound the estimate — quote the range rather
     * than the point when the confidence is low. */
    awaiting: o.awaiting.map((a) => ({
      vendor: a.vendor?.displayName ?? "Unknown",
      received: a.received,
      lastPeriod: a.lastPeriod,
      lastAmount: a.lastAmount,
      expected: a.expected,
      expectedLow: a.expectedLow,
      expectedHigh: a.expectedHigh,
      basis: a.basis,
      confidence: a.confidence,
    })),
  };
}

/** The long-range series, reshaped for the same reason as the overview above.
 *
 * The router emits the same two-currency tree, plus a per-month map of vendor
 * id → amount that is the transpose of the per-vendor arrays sitting next to
 * it — the chart needs both orientations, a model needs one. Dropping the
 * duplicate and the vendor colours takes this from 25 KB to a couple.
 *
 * `arsIndex`/`usdIndex` are kept and are the most valuable numbers here: they
 * rebase each series to 100 at the start of the window, which is how you see
 * whether a bill actually got more expensive or the peso simply moved. */
type Series = Awaited<ReturnType<Caller["insights"]["series"]>>;

function seriesForModel(s: Series) {
  const ars = s.byCurrency.ARS;
  const usd = s.byCurrency.USD;
  return {
    bounds: s.bounds,
    /** One row per month, both currencies, plus the rebased index. */
    totals: s.months.map((month, i) => ({
      month,
      ars: ars.series[i]?.total ?? null,
      usd: usd.series[i]?.total ?? null,
      complete: s.completeFlags[i] ?? false,
      arsIndex: s.inflation.arsIdx[i] ?? null,
      usdIndex: s.inflation.usdIdx[i] ?? null,
    })),
    /** Per vendor, aligned to `totals` by index. Null where that vendor had no
     * bill that month — not zero, which would read as "it was free".
     *
     * `vendorId` for the same reason as in the overview: two properties each
     * have their own "Edesur", and the name alone conflates them. */
    byVendor: ars.perVendor.map((v, i) => ({
      vendorId: v.vendor?.id ?? null,
      vendor: v.vendor?.displayName ?? "Unknown",
      ars: v.values,
      usd: usd.perVendor[i]?.values ?? null,
    })),
  };
}

// ── Shared input pieces ─────────────────────────────────────────────────────

const propertyId = z
  .string()
  .uuid()
  .optional()
  .describe(
    "Restrict to one property, by id from list_properties. Omit to cover every property the user can access.",
  );

const monthTag = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .describe("Month as YYYY-MM.");

// ── The tools ───────────────────────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  defineTool({
    name: "list_properties",
    title: "List properties",
    description:
      "Every property (home, apartment) the user can access, with the vendors and utility accounts attached to each. Start here: most other tools take a property id, and this is where the ids come from.",
    schema: z.object({}),
    run: async (caller) => {
      const properties = await caller.properties.list();
      return properties.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        role: p.role,
        memberCount: p.members?.length ?? null,
      }));
    },
  }),

  defineTool({
    name: "list_vendors",
    title: "List vendors",
    description:
      "Utility vendors (electricity, gas, water, internet…) known for the user's properties, with the id needed by vendor_spending.",
    schema: z.object({ propertyId }),
    run: async (caller, input) => {
      const vendors = await caller.vendors.list(input);
      return vendors.map((v) => ({
        id: v.id,
        name: v.displayName,
        /** Stable identifier the parsers key off ("edenor", "aysa"). Worth
         * exposing: it is what stays put when a user renames a vendor. */
        slug: v.slug,
        propertyId: v.propertyId,
      }));
    },
  }),

  defineTool({
    name: "list_bills",
    title: "List bills",
    description:
      "Bills on the ledger, newest first. Use this for questions about individual bills; use spending_overview for totals and trends.",
    schema: z.object({
      propertyId,
      status: z
        .enum(["parsed", "needs_review"])
        .optional()
        .describe(
          "'needs_review' returns bills the parser could not fully read, which are the ones missing an amount or a period.",
        ),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    run: async (caller, input) => {
      const bills = await caller.bills.list(input);
      return bills.map(billForModel);
    },
  }),

  defineTool({
    name: "get_bill",
    title: "Get one bill",
    description:
      "One bill in full, including its year-over-year comparison against the same vendor's bill twelve months earlier. Does not return the PDF or the raw extracted text.",
    schema: z.object({
      billId: z.string().uuid().describe("Bill id, from list_bills."),
    }),
    run: async (caller, input) => {
      const bill = await caller.bills.get({ id: input.billId });
      return { ...billForModel(bill), yoy: bill.yoy };
    },
  }),

  defineTool({
    name: "spending_overview",
    title: "Spending overview",
    description:
      "The month's snapshot: what has been billed, what is still expected, the last twelve months of totals, and the share each vendor takes. The right tool for 'how much did I spend' and 'is this month unusual'.",
    schema: z.object({
      propertyId,
      month: monthTag
        .optional()
        .describe("Which month to describe. Defaults to the current month."),
    }),
    run: async (caller, input) =>
      overviewForModel(await caller.insights.overview(input)),
  }),

  defineTool({
    name: "spending_series",
    title: "Spending over time",
    description:
      "Monthly totals across a date range, in both pesos and USD, with incomplete months flagged. Use for trends over more than a year.",
    schema: z.object({
      propertyId,
      from: monthTag.optional().describe("First month, inclusive."),
      to: monthTag.optional().describe("Last month, inclusive."),
    }),
    run: async (caller, input) =>
      seriesForModel(await caller.insights.series(input)),
  }),

  defineTool({
    name: "vendor_spending",
    title: "Spending with one vendor",
    description:
      "One vendor's history: monthly amounts, consumption where the parser extracts it, and how the current period compares. Takes a vendor id from list_vendors.",
    schema: z.object({
      propertyId,
      vendorId: z.string().uuid().describe("Vendor id, from list_vendors."),
      from: monthTag.optional(),
      to: monthTag.optional(),
    }),
    run: async (caller, input) => caller.insights.vendorDetail(input),
  }),
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function findTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** The `tools/list` payload. `inputSchema` is generated from the same zod
 * schema that validates the call, so the contract a client reads and the
 * contract the server enforces cannot drift apart. */
export function toolListing() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.schema, { io: "input" }),
    annotations: {
      title: tool.title,
      // Every tool here is a query. `readOnlyHint` is what lets a client run
      // them without prompting the user each time, and it is only honest
      // because the router procedures behind them are all `query`.
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }));
}
