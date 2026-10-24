# Rental payment receipt

Spanish-only public page: `/recibos/alquiler`. Blank and completed PDFs share
the same document shape; the HTML review reads the completed document model.
The model records a monthly rental payment, its currency, any outstanding
balance for that period, and the user's observations and reservations.

The receipt is unsigned and is not an ARCA-authorized fiscal comprobante.
It does not verify payment, identity, representation, or legal consequences.
No blanket release of earlier debts is generated. References are optional and
are not fiscal numbering. The form accepts ARS/USD, without exchange conversion.
Money is parsed as integer cents; thousands separators are rejected to avoid
ambiguity between Argentine and decimal-dot notation.

Personal data lives only in React state. There is no database, API, browser
storage, or entered data in URLs. PDF libraries load on download; only public
font assets are fetched. Form/review elements carry PostHog capture/masking
markers. Fixed analytics events contain no form values or error text. Blob URLs
are revoked on replacement or unmount. Closing/reloading loses entered data.

PDFs use the existing OFL-licensed contract fonts, selectable text and white
A4 pages. Normal receipts fit one page; long content flows onto numbered
continuations without clipping or silently omitting user text.

Sources checked on 2026-10-24:

- Código Civil y Comercial, articles 896–899:
  https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/actualizacion
- ARCA, rental billing by the landlord's tax status:
  https://www.arca.gob.ar/inmuebles/alquileres/propietarios/facturacion.asp

This implementation has not received professional legal or tax approval.
Review wording against the official sources when changing it and update
`RECEIPT_VERSION` when document wording changes.
