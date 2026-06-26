"use client";

import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/landing/parts";
import { cn } from "@/lib/cn";

// Public docs. A sticky table of contents on the left, one article on the right,
// switched client-side with the URL hash as the address (so /docs#first-bill
// deep-links straight to a page — the FAQ relies on that). Content is real, not
// stubbed: it tracks how the app actually behaves.

// ── Prose primitives ─────────────────────────────────────────────────────────
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-semibold text-[22px] tracking-[-0.01em] mt-10 mb-0">
      {children}
    </h2>
  );
}

function P({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <p
      className={cn(
        "font-mono text-sm leading-[1.75] mt-3.5 max-w-[64ch]",
        muted ? "text-muted" : "text-ink",
      )}
    >
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-none p-0 mt-4 max-w-[64ch] flex flex-col gap-2.5">
      {children}
    </ul>
  );
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-[22px] font-mono text-sm leading-[1.6] text-ink before:content-['—'] before:absolute before:left-0 before:text-accent">
      {children}
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.9em] bg-[var(--accent-soft)] border border-line px-[5px] py-px text-ink">
      {children}
    </code>
  );
}

function Callout({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 max-w-[64ch] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-[18px] py-4">
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-accent mb-1.5">
        {label}
      </span>
      <p className="font-mono text-[13.5px] leading-[1.7] text-ink m-0">
        {children}
      </p>
    </div>
  );
}

function Example({
  cap,
  children,
}: {
  cap: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 max-w-[64ch] border border-line bg-card">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted px-4 py-2.5 border-b border-line">
        {cap}
      </div>
      <pre className="ruled m-0 px-4 pt-2 pb-4 font-mono text-[12.5px] text-ink whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────
type Doc = {
  id: string;
  group: string;
  title: string;
  lede: string;
  body: React.ReactNode;
};

const DOCS: Doc[] = [
  {
    id: "welcome",
    group: "Getting started",
    title: "Welcome to Factura",
    lede: "Factura turns a stack of utility-bill PDFs into a calm, running ledger. Drop a bill, and the amount, period and meter reading file themselves under the right property and vendor.",
    body: (
      <>
        <P>
          There is no spreadsheet to keep and no folder to organise. When the
          next bill arrives, you drag it in — Factura does the reconciling and
          remembers the rest.
        </P>
        <H2>What you get</H2>
        <UL>
          <LI>
            Totals per property and per month, in pesos with a USD blue-rate
            estimate alongside.
          </LI>
          <LI>
            Missing-bill detection, so a late invoice never quietly slips by.
          </LI>
          <LI>
            Per-vendor history and insights that show where the money goes over
            time.
          </LI>
        </UL>
        <Callout label="△ Good to know">
          Factura keeps the original PDF stored securely — you can re-parse it
          any time a parser improves.
        </Callout>
        <P muted>
          New here? Start with <Code>Drop your first bill</Code> on the next
          page.
        </P>
      </>
    ),
  },
  {
    id: "first-bill",
    group: "Getting started",
    title: "Drop your first bill",
    lede: "Adding a bill is a drag-and-drop, not a form. Here is the whole flow, start to finish.",
    body: (
      <>
        <H2>Drag, drop, done</H2>
        <UL>
          <LI>Drag any utility-bill PDF anywhere onto the page.</LI>
          <LI>
            Factura reads the text inside it and finds the amount, period, due
            date and meter reading.
          </LI>
          <LI>
            Confirm the property the first time an account appears — you are
            only asked once.
          </LI>
        </UL>
        <Example cap="Extracted · edesur-junio.pdf">
          {`EDESUR S.A.
Período de facturación: 06/2026
Total a pagar: $ 25.253,37
Consumo: 312 kWh
Vencimiento: 18/07/2026`}
        </Example>
        <P>
          From there the bill lands in your ledger under the matching property
          and vendor. The next month&apos;s invoice will recognise the account
          on its own and file itself.
        </P>
        <Callout label="△ If a parser is unsure">
          When a value can&apos;t be read with confidence, the bill is marked{" "}
          <Code>needs review</Code> instead of guessing. You set the value by
          hand once — and because the PDF is stored, it can be re-parsed later
          when the parser is sharpened.
        </Callout>
        <P muted>
          No parser for your vendor yet? See{" "}
          <a href="#build-parser">Build a parser</a>.
        </P>
      </>
    ),
  },
  {
    id: "properties",
    group: "Concepts",
    title: "Properties & accounts",
    lede: "Properties are your homes; accounts tie a vendor's account number to a property so bills route themselves.",
    body: (
      <>
        <P>
          A <Code>property</Code> is a home you track — an apartment or house,
          with its own ledger and monthly totals. Each bill belongs to a
          property through the <Code>account</Code> printed on it (the supply or
          client number the vendor bills against).
        </P>
        <H2>How routing works</H2>
        <UL>
          <LI>
            The first time a new account appears, you confirm which property it
            belongs to.
          </LI>
          <LI>
            After that, every future bill on that account files itself — no
            prompt, no sorting.
          </LI>
          <LI>
            One property can hold many accounts: electricity, gas, internet and
            building expenses all under the same roof.
          </LI>
        </UL>
        <H2>More than one home</H2>
        <P>
          You can own up to three properties on a free account, each kept fully
          separate in totals and insights. Switch between them from the property
          selector at the top of the app.
        </P>
        <H2>Sharing a home</H2>
        <P>
          A property can have more than one member. Invite a flatmate or partner
          and you both see the same ledger for that home; a shared property does
          not count against the owner&apos;s limit. Members can leave, and the
          owner can remove members, at any time.
        </P>
      </>
    ),
  },
  {
    id: "vendors",
    group: "Concepts",
    title: "Vendors & parsers",
    lede: "A vendor is a biller — Edesur, MetroGAS, Telecom, Expensas. Each has a parser that knows how to read its layout.",
    body: (
      <>
        <P>
          A <Code>parser</Code> is a small, vendor-specific reader that locates
          the amount, billing period, due date and consumption inside one bill
          format. Edesur (electricity), MetroGAS (gas), Telecom / Personal
          (internet &amp; phone) and a couple of Expensas formats come ready out
          of the box.
        </P>
        <H2>What a vendor carries</H2>
        <UL>
          <LI>
            A display name and a colour, used consistently across the ledger and
            every chart.
          </LI>
          <LI>One or more parsers that recognise its bills and read them.</LI>
          <LI>
            A history you can filter to, to watch that one biller month over
            month.
          </LI>
        </UL>
        <P>
          Parsers are plain configuration rather than code baked into the app,
          so nothing ties them to a specific company or country. When a vendor
          you use isn&apos;t covered yet, you add it yourself.
        </P>
        <Callout label="△ Next">
          Adding your own vendor takes a few minutes in the visual builder — see{" "}
          <a href="#build-parser">Build a parser</a>.
        </Callout>
      </>
    ),
  },
  {
    id: "build-parser",
    group: "Concepts",
    title: "Build a parser",
    lede: "The parser builder lets you teach Factura a new bill layout — visually, with a live preview and no code.",
    body: (
      <>
        <P>
          Open the builder, drop a sample bill on the left, and build the parser
          on the right. Every value you define is highlighted on the bill text
          as you go, and a live preview shows the parsed result. It comes
          together in two steps.
        </P>
        <H2>1 · Recognise the bill</H2>
        <UL>
          <LI>
            Add one or more <em>signatures</em> — short patterns that uniquely
            identify this vendor and must all appear in the text.
          </LI>
          <LI>
            Optionally add exclusions: patterns that must <em>not</em> appear,
            which lets you split one vendor across two formats.
          </LI>
          <LI>
            Factura checks that the signature matches the sample and{" "}
            <em>doesn&apos;t collide</em> with your other bills before it lets
            you continue.
          </LI>
        </UL>
        <H2>2 · Extract the data</H2>
        <UL>
          <LI>
            <b>Capture</b> values off the bill with a pattern — a small regex
            toolkit helps you point at the right text.
          </LI>
          <LI>
            <b>Derive</b> new values by computing from the ones above (dates,
            totals, conversions).
          </LI>
          <LI>
            Fill the four <b>roles</b> every bill needs: vendor identity,
            amount, period and due date, each with fallbacks for bills that
            print them differently.
          </LI>
          <LI>
            Add <b>custom fields</b> for anything else worth keeping — a meter
            reading or consumption in <Code>kWh</Code> or <Code>m³</Code> —
            which then show up in insights.
          </LI>
        </UL>
        <H2>Save &amp; re-parse</H2>
        <P>
          Saving the parser re-runs it across your existing bills from that
          vendor, so older entries pick up the same reading. You can store a
          bill as a regression sample to guard the parser as you refine it, and
          drop into an advanced JSON mode when you need the raw definition.
        </P>
        <Callout label="△ Good to know">
          Because parsers are configuration, an improved parser can re-read
          every stored PDF — you never have to find and re-upload an old bill.
        </Callout>
      </>
    ),
  },
  {
    id: "blue-rate",
    group: "Concepts",
    title: "ARS & the blue rate",
    lede: "Amounts are stored in pesos. A USD “blue” estimate rides alongside so figures stay legible over time.",
    body: (
      <>
        <P>
          Every total shows its peso value and an approximate dollar figure,
          marked with <Code>≈</Code> — for example{" "}
          <Code>$ 25.253,37 · ≈ US$ 16,51</Code>. Storing pesos keeps the record
          faithful to the bill; the dollar estimate keeps a year of figures
          comparable through inflation.
        </P>
        <H2>How to read it</H2>
        <UL>
          <LI>The peso amount is exactly what the bill says, to the cent.</LI>
          <LI>
            The <Code>≈</Code> dollar figure is an estimate at the blue rate,
            not an accounting record.
          </LI>
          <LI>
            In insights you can switch the whole view between ARS and USD to see
            spend either way.
          </LI>
        </UL>
      </>
    ),
  },
  {
    id: "insights",
    group: "Reference",
    title: "Insights",
    lede: "Stacked spend, vendor share, per-vendor trend, and an inflation lens — pesos vs. the dollar cost.",
    body: (
      <>
        <P>
          The insights view turns the ledger into a picture of where the money
          goes. Pick a property, choose a 12- or 24-month window, and read spend
          as totals or per vendor.
        </P>
        <H2>What&apos;s there</H2>
        <UL>
          <LI>
            <b>Stacked spend</b> — each month broken down by vendor, so the mix
            is visible at a glance.
          </LI>
          <LI>
            <b>Vendor share</b> — which billers take the biggest slice over the
            window.
          </LI>
          <LI>
            <b>Per-vendor trend</b> — filter to one vendor and watch it month
            over month, with the change marked.
          </LI>
          <LI>
            <b>Inflation lens</b> — the same spend in pesos and in dollars, side
            by side, so real movement separates from inflation.
          </LI>
        </UL>
        <Callout label="△ Awaiting">
          When a vendor that usually bills is late for the month, insights mark
          it <span className="text-accent">△ awaiting</span> rather than reading
          it as a drop to zero.
        </Callout>
      </>
    ),
  },
  {
    id: "privacy",
    group: "Reference",
    title: "Privacy & storage",
    lede: "Your bills are scoped to your account. Parsing is mostly local; the PDF is then stored securely.",
    body: (
      <>
        <P>
          Most parsing happens right in your browser — the PDF&apos;s text is
          read on your device. The original file is then kept in secure storage
          so it can be re-parsed later when a parser gets smarter, which is
          useful when a vendor changes a layout.
        </P>
        <UL>
          <LI>Bills are private to your account and anyone you invite.</LI>
          <LI>Stored PDFs are encrypted at rest and re-parsable on demand.</LI>
          <LI>You can delete a bill and its stored file at any time.</LI>
        </UL>
        <P muted>
          Factura is open source under the MIT license — read the code or run
          your own copy from{" "}
          <a
            href="https://github.com/irondsd/factura"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </P>
      </>
    ),
  },
];

const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.id, d]));

// TOC groups, preserving DOCS order.
const GROUPS = DOCS.reduce<{ label: string; ids: string[] }[]>((acc, d) => {
  const bucket = acc.find((g) => g.label === d.group);
  if (bucket) bucket.ids.push(d.id);
  else acc.push({ label: d.group, ids: [d.id] });
  return acc;
}, []);

const PAGER_LABEL =
  "block font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-1";

export function DocsView() {
  const [current, setCurrent] = useState(DOCS[0].id);

  // Adopt the URL hash on mount and follow back/forward navigation.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id && DOC_BY_ID[id]) setCurrent(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const select = (id: string, scroll: boolean) => {
    setCurrent(id);
    history.replaceState(null, "", `#${id}`);
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const doc = DOC_BY_ID[current] ?? DOCS[0];
  const idx = DOCS.findIndex((d) => d.id === doc.id);
  const prev = idx > 0 ? DOCS[idx - 1] : null;
  const next = idx < DOCS.length - 1 ? DOCS[idx + 1] : null;

  const linkClass = useMemo(
    () =>
      "block w-full text-left cursor-pointer bg-transparent border-none py-1.5 px-0 font-mono text-[13px] text-muted transition-colors hover:text-ink",
    [],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)] gap-8 md:gap-14 pt-8 md:pt-12 pb-[72px] items-start">
      {/* ── Table of contents ── */}
      <aside className="md:sticky md:top-[84px]">
        <div className="mb-[18px]">
          <Eyebrow tone="accent">Documentation</Eyebrow>
        </div>
        <nav>
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-[22px]">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2.5">
                {g.label}
              </span>
              <ul className="list-none m-0 p-0 flex flex-col gap-0.5 md:flex-col flex-wrap">
                {g.ids.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => select(id, true)}
                      className={cn(
                        linkClass,
                        id === current &&
                          "text-accent! underline decoration-dotted underline-offset-4",
                      )}
                    >
                      {DOC_BY_ID[id].title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Article ── */}
      <article className="min-w-0 [&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]">
        <div className="mb-3.5">
          <Eyebrow>{doc.group}</Eyebrow>
        </div>
        <h1 className="font-display font-semibold text-[32px] md:text-[38px] tracking-[-0.02em] leading-[1.1] mt-2 mb-0">
          {doc.title}
        </h1>
        <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0 max-w-[62ch]">
          {doc.lede}
        </p>

        {doc.body}

        {/* prev / next */}
        <div className="mt-12 pt-[22px] border-t border-line flex justify-between gap-4 flex-wrap">
          {prev ? (
            <button
              type="button"
              onClick={() => select(prev.id, true)}
              className="bg-transparent border-none cursor-pointer text-left font-mono text-[13px] text-muted transition-colors hover:text-accent"
            >
              <span className={PAGER_LABEL}>‹ Previous</span>
              {prev.title}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button
              type="button"
              onClick={() => select(next.id, true)}
              className="ml-auto bg-transparent border-none cursor-pointer text-right font-mono text-[13px] text-muted transition-colors hover:text-accent"
            >
              <span className={PAGER_LABEL}>Next ›</span>
              {next.title}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

// Re-exported so the FAQ/landing can keep linking by hash without importing
// the data shape.
export const DOC_IDS = DOCS.map((d) => d.id);
