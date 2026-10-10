# Rental contract generator

Public, Spanish-only routes: `/contratos/vivienda` and `/contratos/comercial`.
The `/contratos` entry redirects to housing. Both routes render a shared client
form. `buildContract` is the single source for the text review and PDF.

Personal details stay in React state. There is no API, database persistence,
local storage, or personal data in the URL. The form, review, and preview carry
PostHog's `ph-no-capture` and `ph-mask` markers. PDF libraries load only when
the person generates the document. Font/logo fetches contain no entered data.
Blob URLs are released when replaced or when the form unmounts.

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
Every page has the site's `#f4efe3` paper and `#ddd2bb` dot grid (22 CSS pixels
converted to points), the full `Factura.` wordmark with its orange dot, the exact credit
`Generado por Factura.uno`, and a page count. Keep palette/pattern in sync with
`globals.css`. The wordmark is drawn as vector text with the embedded display
font. Font assets are Google Fonts' OFL-licensed families; both
licenses are shipped beside the files. Fraunces is a static instance at weight
600, optical size 24, SOFT 0, WONK 1. It was generated with fontTools from:

https://github.com/google/fonts/tree/main/ofl/fraunces

IBM Plex Mono Regular comes from:

https://github.com/google/fonts/tree/main/ofl/ibmplexmono
