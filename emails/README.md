# Emails

Transactional email templates, built with [react-email](https://react.email).

## Preview

```bash
bun run email      # live preview at http://localhost:3001
```

## Structure

- **`components/factura-email.tsx`** — the universal shell. `<FacturaEmail>`
  renders the brand frame (wordmark header, paper card, footer) and takes
  `eyebrow` / `title` / `headerTag` / `children`. Exports `styles`, tokens (`C`)
  and a `<DetailRow>` helper. New emails compose through this shell — only the
  content swaps.
- **`components/inline.tsx`** — `<Inline>` plus the pure `tokenizeInline`. Two
  inline markers for campaign copy, `**bold**` and `[label](url)`, with no
  nesting and no unsafe schemes. Everything it doesn't recognise stays literal.
- **`welcome.tsx`** — `WelcomeEmail`, registration / welcome.
- **`opt.tsx`** — `OtpEmail`, the six-digit email sign-in code.
- **`campaign.tsx`** — `CampaignEmail`, one-off broadcasts. The exception to the
  rule below: it reads no dictionary at all. Every string comes from one
  `CampaignContent` object — the body blocks _and_ the brand chrome — because a
  broadcast is write-once copy that would sit in the dictionaries forever,
  unread after the send. `CHROME` in that file holds a per-locale default for
  each chrome field so a send needn't retype the footer every time.

Each template file has a default export (picked up by the preview server) and a
`PreviewProps` for sample data. Transactional copy lives in
`src/i18n/dictionaries/{es,en}.json` under `emails`, resolved per recipient from
`users.locale` — `campaign.tsx` is the one template that opts out of this.

## Brand fidelity / email caveats

Mirrors the Factura design system (`src/app/globals.css` tokens): paper
`#f4efe3`, card `#fdfbf4`, ink `#211d16`, muted `#857b67`, line `#ddd2bb`,
accent `#d9480f`; Fraunces (display) + IBM Plex Mono.

- The dotted-grid page texture and the torn receipt edge are intentionally
  dropped — CSS masks / `background-image` are unreliable across mail clients.
  The look carries on hairline borders, square corners, the type, and the orange
  wordmark dot.
- Webfonts load via a `<link>` in `<Head>`; clients that ignore it fall back to
  the Georgia / monospace stacks baked into every style.
- The accent colour is reserved for links, the wordmark dot, and the decline
  link — kept scarce on purpose.

## Rendering to HTML

```bash
bunx email export --dir emails --outDir .email-out
```

To send, render with `@react-email/render` and hand the HTML to your provider
(SES, Resend, etc.).
