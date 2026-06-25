import type { Metadata } from "next";
import Link from "next/link";
import { SHELL, SiteFoot, SiteTop } from "@/components/landing/chrome";
import { Eyebrow } from "@/components/landing/parts";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Factura — frequently asked questions about bills, parsing, storage and privacy.",
  alternates: { canonical: "/faq" },
};

// Public FAQ. A wider marketing sub-page (not the receipt column) built on the
// shared SiteTop/SiteFoot chrome. Answers are native <details> accordions so
// they work without JS; the first item opens by default.

type Qa = { q: string; a: React.ReactNode };
type Section = { label: string; items: Qa[] };

const CODE =
  "font-mono text-[0.9em] bg-[var(--accent-soft)] border border-line px-[5px] py-[1px] text-ink";

const SECTIONS: Section[] = [
  {
    label: "Getting started",
    items: [
      {
        q: "What does Factura actually do?",
        a: "You drop a utility-bill PDF and Factura reads the amount, period and meter reading, then files it into a running ledger per property and month. No spreadsheet, no manual entry.",
      },
      {
        q: "Which bills can I add?",
        a: "Edesur, MetroGAS, Personal and Expensas come ready out of the box. Any other vendor can be added too — you teach Factura the layout once in the parser builder and it handles every future bill.",
      },
      {
        q: "How do I add a bill?",
        a: (
          <>
            Drag the PDF anywhere onto the page. The first time an account
            appears, you&apos;ll confirm which property it belongs to — after
            that, every future bill files itself. See{" "}
            <Link href="/docs#first-bill">Drop your first bill</Link>.
          </>
        ),
      },
      {
        q: "What kind of PDF works?",
        a: "A real, text-based PDF — the kind your vendor emails or you download from their portal. Factura reads the text inside it, so a photo or a flat scan with no selectable text won't parse. If a file has no readable text, you'll be told rather than left guessing.",
      },
    ],
  },
  {
    label: "Parsers & vendors",
    items: [
      {
        q: "What if my vendor isn't supported?",
        a: (
          <>
            You can add it yourself — this is the heart of Factura. Parsers are
            plain configuration, not code baked into the app, so nothing ties
            them to a specific company or country. Open the parser builder, drop
            a sample bill, and define how to recognize the vendor and where the
            amount, period, due date and meter reading sit. Save it and every
            future bill from that vendor files itself.
          </>
        ),
      },
      {
        q: "Do I need to know how to code?",
        a: "No. The builder is visual: you drop a sample bill on one side and build the parser on the other, with each value highlighted on the page as you go and a live preview of the parsed result. A small regex toolkit helps you point at the right text. It checks that your parser matches this bill and doesn't collide with your other vendors before you save.",
      },
      {
        q: "Can I track more than the amount?",
        a: "Yes. Beyond the four core fields — vendor, amount, period and due date — you can capture custom fields like a meter reading or consumption in m³ or kWh. Those ride along on the bill and show up in insights, so you can watch usage, not just cost, over time.",
      },
      {
        q: "What happens when a parser gets better?",
        a: "Because the original PDF is kept in storage, Factura can re-read it with the improved parser — no need to find and re-upload anything. Saving a parser re-parses your existing bills from that vendor in place, so old entries get the fix too.",
      },
    ],
  },
  {
    label: "Privacy & storage",
    items: [
      {
        q: "Where are my PDFs stored?",
        a: "Most parsing happens locally in your browser. The original PDF is then kept in secure storage so it can be re-parsed later — handy when a vendor changes a layout. Your bills are scoped to your account.",
      },
      {
        q: "Can I delete a bill?",
        a: "Yes — deleting a bill removes its ledger entry and its stored file. There's no hidden copy left behind.",
      },
      {
        q: "Who can see my ledger?",
        a: "Only you — and anyone you explicitly invite to a property. Bills are private to your account, and stored files are encrypted at rest.",
      },
      {
        q: "Can I share a home with someone else?",
        a: "Yes. A property can have more than one member — invite a flatmate or partner and you both see the same ledger for that home. You can keep several properties under one account, each with its own bills and totals, and leave or remove members at any time.",
      },
    ],
  },
  {
    label: "Money & numbers",
    items: [
      {
        q: "Why do I see both pesos and dollars?",
        a: (
          <>
            Amounts are stored in ARS, with an approximate USD &ldquo;blue&rdquo;
            estimate alongside (marked <code className={CODE}>≈</code>) so figures
            stay legible across months of inflation. The rate is an estimate, not
            an accounting record.
          </>
        ),
      },
      {
        q: "What happens if a bill is missing?",
        a: (
          <>
            Factura knows what usually arrives. When a vendor is late for the
            month, you&apos;ll see <span className="text-accent">△ awaiting</span>{" "}
            in the summary — not a silent gap.
          </>
        ),
      },
    ],
  },
  {
    label: "About Factura",
    items: [
      {
        q: "Is Factura open source?",
        a: (
          <>
            Yes — Factura is open source under the MIT license. You can read the
            code, file an issue, or run your own copy. It lives on{" "}
            <a
              href="https://github.com/irondsd/factura"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            .
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <SiteTop active="FAQ" />

      <main className={SHELL}>
        {/* ── Head ─────────────────────────────────────────────── */}
        <header className="max-w-[640px] pt-14 pb-2">
          <Eyebrow tone="accent">Help</Eyebrow>
          <h1 className="font-display font-semibold text-[36px] sm:text-[46px] tracking-[-0.025em] leading-[1.05] mt-[18px] mb-0">
            Questions &amp; answers
          </h1>
          <p className="font-mono text-[15px] leading-[1.7] text-muted mt-[18px] mb-0">
            The short version of how Factura works. Can&apos;t find it here? The
            docs go deeper.
          </p>
        </header>

        {/* ── Sections ─────────────────────────────────────────── */}
        {SECTIONS.map((section) => (
          <section key={section.label} className="pt-10">
            <div className="mb-2">
              <Eyebrow>{section.label}</Eyebrow>
            </div>
            <div className="border-t border-line">
              {section.items.map((item, i) => (
                <FaqItem key={item.q} item={item} open={section === SECTIONS[0] && i === 0} />
              ))}
            </div>
          </section>
        ))}

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="fd-card mt-14 mb-16 px-7 pt-9 pb-12 text-center">
          <h2 className="font-display font-semibold text-[28px] tracking-tight m-0 mb-2">
            Still have a question?
          </h2>
          <p className="font-mono text-sm text-muted m-0 mb-[22px]">
            The docs cover the rest — or just start your ledger and see.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center font-mono text-[13px] uppercase tracking-[0.12em] no-underline border border-ink bg-ink text-paper py-3 px-[26px] transition-colors hover:bg-transparent hover:text-ink"
          >
            Get started
          </Link>
        </section>
      </main>

      <SiteFoot />
    </>
  );
}

function FaqItem({ item, open }: { item: Qa; open?: boolean }) {
  return (
    <details className="group border-b border-line" open={open}>
      <summary
        className={cn(
          "flex items-center justify-between gap-4 cursor-pointer list-none py-5 pr-1",
          "font-mono text-[15.5px] text-ink transition-colors",
          "hover:text-accent group-open:text-accent",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <span>{item.q}</span>
        <span className="flex-none font-mono text-xl leading-none text-muted group-open:text-accent">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <div className="font-mono text-sm leading-[1.75] text-muted max-w-[70ch] pr-10 pb-[22px] [&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]">
        {item.a}
      </div>
    </details>
  );
}
