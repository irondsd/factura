import type { Metadata } from "next";
import Link from "next/link";
import {
  Bullets,
  LegalPage,
  type LegalSection,
} from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Factura handles your data — what it collects (bills, account email, properties), where it's stored, the third parties involved, and how to delete your data.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    heading: "The short version",
    body: (
      <>
        <p>
          Factura is a bill ledger: you upload utility-bill PDFs and it keeps a
          private, per-property history of your spending. This page explains what
          data that involves, where it lives, and how to remove it.
        </p>
        <p>
          The guiding principle is restraint. Factura stores what it needs to
          show you your ledger and nothing more — there are no ads, no tracking
          profiles, and your bills are never sold or shared with anyone you
          haven&apos;t personally invited. Factura is{" "}
          <a
            href="https://github.com/irondsd/factura"
            target="_blank"
            rel="noreferrer"
          >
            open source
          </a>
          , so you can read exactly how your data is handled, or run your own
          copy.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    heading: "What Factura stores",
    body: (
      <>
        <p>The data Factura keeps falls into a few groups:</p>
        <Bullets
          items={[
            <>
              <strong>Account</strong> — your email address, and (if you sign in
              with Google) your name and avatar. That&apos;s the whole identity
              we hold. There is no password — see{" "}
              <Link href="/security#authentication">Security</Link>.
            </>,
            <>
              <strong>Bills</strong> — the PDFs you upload, the text extracted
              from them, and the fields parsed out (vendor, amount, billing
              period, due date, and any meter readings or consumption figures).
              The original file is kept so a bill can be re-parsed later.
            </>,
            <>
              <strong>Properties &amp; vendors</strong> — the property nicknames
              and address variants you enter, and the vendor accounts your bills
              are filed under.
            </>,
            <>
              <strong>Parser samples</strong> — if you build a custom parser, the
              sample bill text you attach to it is saved (scoped to your account
              only) so the parser can be re-tested when you edit it.
            </>,
            <>
              <strong>Technical</strong> — a session cookie to keep you signed
              in, and ordinary server logs. Factura sets no advertising or
              cross-site tracking cookies.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "how-we-use-it",
    heading: "How it's used",
    body: (
      <>
        <p>Your data is used only to run the product you asked for:</p>
        <Bullets
          items={[
            "Parsing your bills and keeping your ledger, totals and insights up to date.",
            "Estimating a USD value alongside the peso amount, using a public exchange-rate feed.",
            "Sending transactional email — a sign-in code, a one-time welcome, and a notification when someone shares a property with you.",
          ]}
        />
        <p>
          Factura does not profile you, run behavioural analytics, or use your
          bill contents for anything beyond showing them back to you.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    heading: "Where it lives",
    body: (
      <>
        <p>
          A bill&apos;s text is extracted in your browser; that text and the
          original PDF are then sent to Factura, parsed, and stored. Structured
          data (your account, bills, properties and parsed fields) lives in a
          managed <strong>PostgreSQL</strong> database. Original PDFs are kept in{" "}
          <strong>S3-compatible object storage</strong>, encrypted at rest by the
          storage provider and stored under keys namespaced to your account.
        </p>
        <p>
          Files are never served from a public URL — the &ldquo;View PDF&rdquo;
          link generates a short-lived, signed link each time, so access always
          passes through an authorization check. The USD &ldquo;blue&rdquo; rate
          comes from a public Argentine exchange-rate API; no personal data is
          sent to it.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    heading: "Third parties",
    body: (
      <>
        <p>
          Factura relies on a small set of infrastructure providers to operate.
          They process data on Factura&apos;s behalf and only to deliver their
          part of the service:
        </p>
        <Bullets
          items={[
            <>
              <strong>Google</strong> — optional sign-in (OAuth). Used only if
              you choose &ldquo;Continue with Google&rdquo;.
            </>,
            <>
              <strong>Resend</strong> — delivery of transactional email (sign-in
              codes, welcome, share invites).
            </>,
            <>
              <strong>Object-storage &amp; hosting providers</strong> — store
              your PDFs and run the application and database.
            </>,
            <>
              <strong>argentinadatos.com</strong> — the public exchange-rate
              feed; receives no personal data.
            </>,
          ]}
        />
        <p>
          The exact providers depend on the deployment — if you self-host, you
          choose them yourself.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "Sharing a property",
    body: (
      <>
        <p>
          A property can have more than one member. When you invite someone by
          email, that invitation reveals the property&apos;s nickname to them and
          lets them accept or decline. Once they join, they can see the ledger
          for <strong>that property only</strong> — never your other properties.
        </p>
        <p>
          Members can leave, and owners can remove members or revoke pending
          invites, at any time.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "Keeping & deleting data",
    body: (
      <>
        <p>Your data stays until you remove it, and removal is real:</p>
        <Bullets
          items={[
            <>
              <strong>Delete a bill</strong> — removes its ledger entry and its
              stored PDF together. No hidden copy is kept.
            </>,
            <>
              <strong>Delete a property</strong> — tears down its bills, vendors,
              accounts and stored files in one go.
            </>,
            <>
              <strong>Delete your account</strong> — contact us (below) and we
              will remove your account and associated data.
            </>,
          ]}
        />
        <p>
          Backups and logs may persist for a short, rolling window before they
          age out.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "Your choices",
    body: (
      <p>
        Your bills are yours. You can view and edit them, export the underlying
        PDFs at any time, and delete any bill, property, or your whole account.
        For access or deletion requests we can&apos;t already do from the app,
        reach out and we&apos;ll help.
      </p>
    ),
  },
  {
    id: "children",
    heading: "Children",
    body: (
      <p>
        Factura is a tool for managing household bills and is not directed at
        children. Don&apos;t use it if you are under the age of digital consent
        in your country.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes & contact",
    body: (
      <>
        <p>
          If this policy changes materially, the &ldquo;last updated&rdquo; date
          above will change and significant updates will be noted in the project
          history. Continued use after a change means you accept the revised
          policy.
        </p>
        <p>
          Questions about your data? Email{" "}
          <a href="mailto:privacy@factura.uno">privacy@factura.uno</a>, or open an
          issue on{" "}
          <a
            href="https://github.com/irondsd/factura"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          . For anything security-related, see the{" "}
          <Link href="/security">Security</Link> page.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      active="Privacy"
      eyebrow="Privacy"
      title="Your bills, kept to yourself"
      intro="What Factura collects, why, where it's stored, and how to take it back. Plain language, no surprises."
      updated="June 2026"
      sections={SECTIONS}
    />
  );
}
