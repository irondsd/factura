/**
 * Email 4 — Campaign / broadcast.
 *
 * The one template here that reads nothing from src/i18n/dictionaries. The
 * others are transactional: their wording is product vocabulary, it ships once,
 * and a dictionary key is the right home for it. A broadcast is the opposite —
 * write-once copy that would sit in both dictionaries forever, read by nobody
 * after the send.
 *
 * So a campaign is self-contained. Every string in the rendered email comes
 * from one `CampaignContent` object: the body, and the brand chrome around it.
 * Write one object per locale and pick by the recipient's `users.locale`. The
 * chrome is tedious to retype, so `CHROME` below carries a per-locale default
 * for each piece — but it lives in this file, next to the only template that
 * reads it, not in the shared dictionaries.
 *
 * Content is a list of blocks rather than free text, and each block maps 1:1
 * onto a component the shell already styles — so an author cannot describe an
 * email the shell doesn't know how to render. Within a block's copy, the two
 * inline markers in ./components/inline handle emphasis and links.
 *
 * Note there is still no unsubscribe link: the shell's `unsubscribeUrl` is
 * commented out and `users` has no opt-out column. `footerNote` is overridable
 * so a send can say something truer than the default account notice, but a
 * genuine opt-out is a prerequisite for anything automatic.
 */

import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
// `interpolate` and `Locale` are generic helpers, not dictionary data — no
// campaign copy comes through them.
import { interpolate, type Locale } from "../src/i18n/config";
import { C, FacturaEmail, styles } from "./components/factura-email";
import { Inline } from "./components/inline";

export type CampaignBlock =
  /** A paragraph. Supports `**bold**` and `[label](url)`. */
  | { type: "text"; text: string }
  /** The call to action. One per email reads best; the shell doesn't stop two. */
  | { type: "button"; label: string; href: string }
  /** Short items, hanging-indented with a mono marker. */
  | { type: "list"; items: string[] }
  /** The small muted aside — `styles.voice`, as the welcome email signs off. */
  | { type: "note"; text: string }
  /** A human sign-off. Only the person is content; the sentence around them
   * comes from `signatureLine`, so both must be written in the same language
   * as the rest of the `CampaignContent` they sit in. */
  | { type: "signature"; name: string; role: string };

/** The brand frame around the body. Every field has a `CHROME` default per
 * locale, so a send only names the ones it wants to say differently. They are
 * all overridable because the shell's own fallbacks are hardcoded English —
 * leaving one unset would put an English line under a Spanish email. */
export type CampaignChrome = {
  /** Mono uppercase tag, header right. */
  headerTag: string;
  /** Footer disclosure — why this landed in their inbox. */
  footerNote: string;
  /** Footer tagline under the wordmark. */
  footerTagline: string;
  /** The `signature` block's sentence. `{name}` and `{role}` are filled from
   * the block; the `**` marker is here so the emphasis is visible to whoever
   * edits the wording. */
  signatureLine: string;
};

export type CampaignContent = Partial<CampaignChrome> & {
  /** Not rendered here — the send path passes it to Resend. It lives on the
   * content object so one object is everything a send needs. */
  subject: string;
  /** Hidden inbox-preview line. Skipping it lets clients improvise from the
   * first words of the body, which reads like a bug. */
  preheader: string;
  /** Mono uppercase label above the title. */
  eyebrow: string;
  /** Fraunces display title. */
  title: string;
  blocks: CampaignBlock[];
};

/** Per-locale chrome defaults. Deliberately not in src/i18n/dictionaries: only
 * this template reads them, and a campaign should be readable start to finish
 * in one file. */
export const CHROME: Record<Locale, CampaignChrome> = {
  es: {
    headerTag: "Cuenta",
    footerNote: "Recibís esto porque tenés una cuenta en Factura.",
    footerTagline: "Registro personal de servicios · Argentina",
    signatureLine: "Enviado personalmente por **{name}**, {role}.",
  },
  en: {
    headerTag: "Account",
    footerNote: "You're receiving this because you have a Factura account.",
    footerTagline: "Personal utility ledger · Argentina",
    signatureLine: "Sent personally by **{name}**, {role}.",
  },
};

export type CampaignEmailProps = {
  /** Sets `<Html lang>` and picks the `CHROME` defaults. It does not translate
   * anything: the copy is whatever language `content` is written in. */
  locale?: Locale;
  content?: CampaignContent;
  /** Substituted into every rendered string. `interpolate` leaves an unknown
   * `{key}` visible on purpose, which in a broadcast means it reaches an inbox
   * verbatim — the send path should refuse content whose placeholders it can't
   * fill rather than relying on this. */
  vars?: Record<string, string>;
};

const SAMPLE: CampaignContent = {
  subject: "Tu registro te está esperando",
  preheader: "Soltá una factura y te armamos el historial.",
  eyebrow: "Primeros pasos",
  title: "Falta una factura.",
  blocks: [
    { type: "text", text: "Hola {name}, gracias por registrarte en Factura." },
    {
      type: "text",
      text: "Tu registro está listo pero **todavía está vacío**. Con una sola factura ya podés ver de qué se trata:",
    },
    {
      type: "list",
      items: [
        "Leemos el monto, el período y el proveedor del PDF.",
        "Guardamos el total acumulado por propiedad.",
        "A partir de la segunda, compará mes contra mes.",
      ],
    },
    {
      type: "button",
      label: "Subí tu primera factura ›",
      href: "https://example.com/app",
    },
    {
      type: "note",
      text: "Leído en tu navegador · guardado en tu registro. ¿Consultas? [Escribinos](mailto:hola@example.com).",
    },
    {
      type: "signature",
      name: "Konstantin Mednikov",
      role: "fundador de Factura",
    },
  ],
};

export function CampaignEmail({
  locale = "es",
  content = SAMPLE,
  vars = {},
}: CampaignEmailProps) {
  const fill = (copy: string) => interpolate(copy, vars);
  const chrome: CampaignChrome = {
    ...CHROME[locale],
    ...stripUndefined(content),
  };

  return (
    <FacturaEmail
      locale={locale}
      preheader={fill(content.preheader)}
      headerTag={chrome.headerTag}
      eyebrow={content.eyebrow}
      title={fill(content.title)}
      footerNote={chrome.footerNote}
      footerTagline={chrome.footerTagline}
    >
      {content.blocks.map((block, index) => (
        <CampaignBlockView
          key={`${index}-${block.type}`}
          block={block}
          fill={fill}
          chrome={chrome}
        />
      ))}
    </FacturaEmail>
  );
}

/** Spread-merging `content` over `CHROME` would let an explicit `undefined`
 * erase a default, so drop absent keys before merging. */
function stripUndefined(content: CampaignContent): Partial<CampaignChrome> {
  const keys = [
    "headerTag",
    "footerNote",
    "footerTagline",
    "signatureLine",
  ] as const;
  const out: Partial<CampaignChrome> = {};
  for (const key of keys) {
    const value = content[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function CampaignBlockView({
  block,
  fill,
  chrome,
}: {
  block: CampaignBlock;
  fill: (copy: string) => string;
  chrome: CampaignChrome;
}) {
  switch (block.type) {
    case "text":
      return (
        <Text style={styles.text}>
          <Inline text={fill(block.text)} />
        </Text>
      );

    case "button":
      // Matches the welcome email's CTA spacing.
      return (
        <Section style={{ padding: "16px 0 0" }}>
          <Button href={block.href} style={styles.button}>
            {fill(block.label)}
          </Button>
        </Section>
      );

    case "list":
      // Paragraphs with a hanging indent, not a <ul>: Outlook's list rendering
      // is the least predictable thing in email, and a mono marker sits closer
      // to the brand voice than a browser bullet anyway. The negative indent
      // keeps wrapped lines aligned under the first word.
      return (
        <Section style={{ margin: "0 0 16px" }}>
          {block.items.map((item, index) => (
            <Text
              key={`${index}-item`}
              style={{
                ...styles.text,
                margin: "0 0 6px",
                paddingLeft: "16px",
                textIndent: "-16px",
              }}
            >
              <span style={{ color: C.muted }}>{"· "}</span>
              <Inline text={fill(item)} />
            </Text>
          ))}
        </Section>
      );

    case "note":
      return (
        <Text style={{ ...styles.voice, margin: "14px 0 0" }}>
          <Inline text={fill(block.text)} />
        </Text>
      );

    case "signature":
      // Muted like a note, so it reads as a sign-off rather than competing
      // with the CTA above it; the name carries weight but inherits the muted
      // colour, which keeps the block quiet the way the brand wants it.
      return (
        <Text style={{ ...styles.voice, margin: "20px 0 0" }}>
          <Inline
            text={interpolate(chrome.signatureLine, {
              name: block.name,
              role: block.role,
            })}
          />
        </Text>
      );

    default: {
      // Exhaustiveness guard: a new block type has to be rendered here before
      // it typechecks anywhere else.
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

// Preview defaults for `email dev`. Placeholder copy that exercises every block
// type and both inline markers — not the wording for any actual send.
CampaignEmail.PreviewProps = {
  locale: "es",
  vars: { name: "Marisol" },
} satisfies CampaignEmailProps;

export default CampaignEmail;
