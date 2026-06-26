import type { Metadata } from "next";
import Link from "next/link";
import {
  Bullets,
  LegalPage,
  type LegalSection,
} from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Factura keeps your bills safe — passwordless authentication, per-account data isolation, encrypted storage with signed access, TLS in transit, and how to report a vulnerability.",
  alternates: { canonical: "/security" },
};

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    heading: "Our approach",
    body: (
      <>
        <p>
          Factura holds something personal — a record of your household bills —
          so it&apos;s built to keep that record private by default. This page
          describes the measures in place and how to report a problem.
        </p>
        <p>
          Because Factura is{" "}
          <a
            href="https://github.com/irondsd/factura"
            target="_blank"
            rel="noreferrer"
          >
            open source
          </a>
          , these claims are verifiable: the authentication, authorization and
          storage code is all public. For how data is collected and used, see{" "}
          <Link href="/privacy">Privacy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "authentication",
    heading: "Authentication",
    body: (
      <>
        <p>
          Sign-in is <strong>passwordless</strong>. Factura never stores a
          password, so there isn&apos;t one to leak. You sign in one of two ways:
        </p>
        <Bullets
          items={[
            <>
              <strong>Google</strong> — standard OAuth; Factura never sees your
              Google password.
            </>,
            <>
              <strong>Email code</strong> — a single-use six-digit code, valid
              for ten minutes, generated with a cryptographic random source and
              consumed on first use.
            </>,
          ]}
        />
        <p>
          Sessions are server-side and tracked in the database, carried in an
          <strong> http-only</strong> cookie that JavaScript can&apos;t read.
          Signing in by email links to the same account as Google when the
          address matches, so you never end up with split data.
        </p>
      </>
    ),
  },
  {
    id: "authorization",
    heading: "Data isolation",
    body: (
      <>
        <p>
          Every request is scoped to the signed-in user on the server. Access to
          a property is governed by a single source of truth — its membership
          list — and each API call re-checks it; nothing relies on the UI to hide
          data it shouldn&apos;t fetch.
        </p>
        <p>
          The practical effect: you can only ever read or change bills,
          properties and vendors you own or have been explicitly invited to. An
          unfiled upload is visible only to the person who uploaded it.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    heading: "Stored files",
    body: (
      <>
        <p>
          Original PDFs live in S3-compatible object storage, encrypted at rest
          by the provider and stored under keys namespaced per account. The
          bucket is never public.
        </p>
        <p>
          When you open a PDF, Factura mints a <strong>short-lived signed URL</strong>{" "}
          for that single file after checking you&apos;re allowed to see it — so
          access is always time-boxed and authorized, never a guessable public
          link. Deleting a bill deletes its stored object.
        </p>
      </>
    ),
  },
  {
    id: "transit",
    heading: "Data in transit",
    body: (
      <p>
        All traffic — the app, the API, transactional email links, and the signed
        storage URLs — is served over <strong>HTTPS/TLS</strong>. Bill text is
        extracted in your browser and sent over that encrypted connection for
        parsing and storage.
      </p>
    ),
  },
  {
    id: "infrastructure",
    heading: "Infrastructure & dependencies",
    body: (
      <>
        <p>
          Secrets (database, storage and email credentials) are supplied through
          environment variables and are never committed to the repository. The
          database and object storage are managed services.
        </p>
        <p>
          Factura is built on well-maintained, widely-audited open-source
          libraries, and dependencies are kept current to take in upstream
          security fixes.
        </p>
      </>
    ),
  },
  {
    id: "your-part",
    heading: "Your part",
    body: (
      <p>
        Since sign-in flows through your email, the security of your inbox and
        your Google account is the front door to your ledger. Protect those —
        enable two-factor authentication on them — and sign out on shared
        devices.
      </p>
    ),
  },
  {
    id: "reporting",
    heading: "Reporting a vulnerability",
    body: (
      <>
        <p>
          Found a security issue? Please report it privately and give us a chance
          to fix it before any public disclosure. We welcome and appreciate
          good-faith reports.
        </p>
        <Bullets
          items={[
            <>
              Email{" "}
              <a href="mailto:security@factura.uno">security@factura.uno</a>, or
              open a private{" "}
              <a
                href="https://github.com/irondsd/factura/security/advisories/new"
                target="_blank"
                rel="noreferrer"
              >
                GitHub security advisory
              </a>
              .
            </>,
            "Include steps to reproduce, the impact, and anything we need to confirm it.",
            "Please don't run tests that degrade the service, access other people's data, or exfiltrate data beyond what's needed to prove the issue.",
          ]}
        />
        <p>
          We&apos;ll acknowledge your report, keep you posted on the fix, and
          credit you if you&apos;d like.
        </p>
      </>
    ),
  },
  {
    id: "disclaimer",
    heading: "Honest limits",
    body: (
      <p>
        No system is perfectly secure, and Factura is provided as open-source
        software without warranty. We aim for sensible, verifiable protections
        and continual improvement — and if you need full control, you can{" "}
        <a
          href="https://github.com/irondsd/factura"
          target="_blank"
          rel="noreferrer"
        >
          self-host
        </a>{" "}
        the whole thing.
      </p>
    ),
  },
];

export default function SecurityPage() {
  return (
    <LegalPage
      active="Security"
      eyebrow="Security"
      title="Built to keep your ledger private"
      intro="Passwordless sign-in, strict per-account isolation, encrypted storage with signed access, and a clear path to report issues."
      updated="June 2026"
      sections={SECTIONS}
    />
  );
}
