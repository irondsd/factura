# Rental contract generator

Public, Spanish-only routes: `/contratos/vivienda` and `/contratos/comercial`.
The `/contratos` entry redirects to housing. Both routes render a shared client
form. `buildContract` is the single source for the text review and PDF;
`buildBlankContract` runs the same clauses with lines in place of the data, for
the "modelo en blanco" download. Page copy, field tooltips and the FAQ live in
`content.ts`, with the article of the Código Civil y Comercial each legal
statement rests on. These pages own the "pdf / para imprimir / gratis" searches;
"modelo simple" and "nueva ley" belong to the guides they link to.

Personal details stay in React state. There is no API, database persistence,
local storage, or personal data in the URL. The form, review, and preview carry
PostHog's `ph-no-capture` and `ph-mask` markers. PDF libraries load only when
the person generates the document. Font/logo fetches contain no entered data.
Blob URLs are released when replaced or when the form unmounts.

## Analytics

Both routes send explicit PostHog events through the existing browser client:

- `contract_blank_downloaded`: after the browser starts the blank PDF download,
  including repeat downloads from the cached PDF. `contract_type` is `vivienda`
  or `comercial`. PDF generation failures do not emit this event; the browser
  cannot confirm whether the person ultimately saves the file.
- `contract_step_completed`: after a validated `Continuar` or `Revisar contrato`
  submission. Properties are `contract_type`, one-based `step` (1–4),
  `step_name` (the fixed UI label), one-based `next_step` (2–5), and `action`
  (`continue` for steps 1–3, `review` for step 4). Validation failures and
  backward navigation emit nothing; completing an edited step emits it again.

Build the form funnel from `contract_step_completed`, filtering successive
steps 1, 2, 3, 4, and split by `contract_type`. Step 4 means the contract review
opened, not that a filled PDF was generated. Blank downloads are an independent
path. No names, IDs, emails, addresses, amounts, or other form values are sent.
The form's autocapture and replay masking markers remain in place.

## Scope and legal review

These are new-contract templates, not an assessment of an individual agreement.
The implementation has **not received professional legal approval**. Before a
public launch, an Argentine lawyer should review the complete clauses, form
choices, jurisdiction coverage, and terms for the generator. In particular:

- expense allocation under articles 958 and 1209;
- personal surety wording, multiple parties, and representation;
- early termination when future indexed rents are not yet known;
- commercial permit risk, works, insurance, and local authorization;
- local stamp duty, venue, and mandatory formalities;
- the scope of legal advice and privacy obligations for this service.

Excluded: tourist/temporary rentals, rooms, subleases, mixed uses, agricultural
leases, concessions, and specialist operations. Guarantees supported are no
personal surety or a personal solidary surety; insurance guarantees, bank
guarantees, and mortgages require separate documents. USD contracts use a fixed
rent; IPC/ICL are offered only for ARS. No tax or habilitation is calculated or
certified. The PDF is unsigned. Changes require a newly generated PDF.

Sources checked on 2026-10-10:

- https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/actualizacion
- https://www.argentina.gob.ar/normativa/nacional/norma-395521/texto
- https://vivienda.buenosaires.gob.ar/dnu-70-2023
- https://www.argentina.gob.ar/normativa/nacional/ley-25506-70749/actualizacion
- https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion

Update `CONTRACT_VERSION` when clauses change. Versioning records provenance;
it is not a certification or a legal-review date. The existing CMS commercial
guide says Factura does not draft contracts; its closing copy needs an editorial
update at launch. Publishing that CMS update requires explicit human approval.
Contextual tool links are rendered by the guide route with the code release.

## PDF identity and assets

A4, selectable text, subset embedded Fraunces SemiBold and IBM Plex Mono Regular.
Pages are plain white so the document prints cleanly; no paper tint or dot
grid. Every page has the full `Factura.` wordmark with its orange dot, the exact
credit `Generado por Factura.uno`, and a page count. Keep the ink, rule and
accent colours in sync with `globals.css`. The wordmark is drawn as vector text with the embedded display
font. Font assets are Google Fonts' OFL-licensed families; both
licenses are shipped beside the files. Fraunces is a static instance at weight
600, optical size 24, SOFT 0, WONK 1. It was generated with fontTools from:

https://github.com/google/fonts/tree/main/ofl/fraunces

IBM Plex Mono Regular comes from:

https://github.com/google/fonts/tree/main/ofl/ibmplexmono
