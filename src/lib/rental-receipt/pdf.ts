import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  buildBlankReceipt,
  buildReceipt,
  FISCAL_NOTICE,
  RECEIPT_VERSION,
  type ReceiptData,
  type ReceiptDocument,
} from "./model";

const ink = rgb(33 / 255, 29 / 255, 22 / 255);
const muted = rgb(100 / 255, 90 / 255, 71 / 255);
const accent = rgb(217 / 255, 72 / 255, 15 / 255);
const rule = rgb(221 / 255, 210 / 255, 187 / 255);
const PAGE = { width: 595.28, height: 841.89, margin: 48, bottom: 104 };

export function generateReceiptPdf(
  data?: ReceiptData,
): Promise<Uint8Array<ArrayBuffer>> {
  return renderReceiptPdf(data ? buildReceipt(data) : buildBlankReceipt());
}

/** Same document as the HTML review; no entered data is sent over the network. */
async function renderReceiptPdf(
  document: ReceiptDocument,
): Promise<Uint8Array<ArrayBuffer>> {
  const assets = await Promise.all(
    ["Fraunces-SemiBold.ttf", "IBMPlexMono-Regular.ttf"].map(async (name) => {
      const response = await fetch(`/fonts/contract/${name}`);
      if (!response.ok)
        throw new Error(
          "No pudimos cargar las fuentes. Revisá tu conexión y volvé a descargar el PDF.",
        );
      return response.arrayBuffer();
    }),
  );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const display = await pdf.embedFont(assets[0], { subset: true });
  const body = await pdf.embedFont(assets[1], { subset: true });
  pdf.setTitle("Recibo de alquiler");
  pdf.setAuthor("Factura.uno");
  pdf.setCreator(`Factura.uno - recibo ${RECEIPT_VERSION}`);
  pdf.setSubject(
    "Constancia de pago para revisión y firma. No reemplaza un comprobante fiscal.",
  );
  pdf.setLanguage("es-AR");
  const width = PAGE.width - 2 * PAGE.margin;
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - 60;

  function wrap(
    value: string,
    font: PDFFont,
    size: number,
    maxWidth = width,
  ): string[] {
    const text = value
      .normalize("NFC")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
    const supported = new Set(font.getCharacterSet());
    for (const char of text) {
      if (!/\s/.test(char) && !supported.has(char.codePointAt(0)!)) {
        throw new Error(
          `El PDF no admite el carácter «${char}». Reemplazalo en el formulario y volvé a intentarlo.`,
        );
      }
    }
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function ensure(height: number) {
    if (y - height >= PAGE.bottom) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - 55;
    page.drawText("Recibo de alquiler (continuación)", {
      x: PAGE.margin,
      y,
      font: display,
      size: 15,
      color: ink,
    });
    y -= 32;
  }
  function paragraph(
    value: string,
    font = body,
    size = 9.5,
    leading = 15,
    gap = 12,
    color = ink,
  ) {
    for (const line of wrap(value, font, size)) {
      ensure(leading);
      if (line) page.drawText(line, { x: PAGE.margin, y, size, font, color });
      y -= leading;
    }
    y -= gap;
  }

  paragraph("Recibo de alquiler", display, 30, 35, 12);
  paragraph(
    `Fecha de pago: ${document.date}${document.reference ? `\nReferencia: ${document.reference}` : ""}`,
    body,
    9,
    15,
    12,
    muted,
  );
  page.drawLine({
    start: { x: PAGE.margin, y },
    end: { x: PAGE.width - PAGE.margin, y },
    color: rule,
    thickness: 0.8,
  });
  y -= 26;
  paragraph("Importe recibido", body, 9, 14, 17, muted);
  paragraph(document.amount, display, 25, 30, 10);
  paragraph(`Período del alquiler: ${document.period}`, body, 9, 14, 21);
  for (const text of document.paragraphs) paragraph(text);
  const reservationLines = wrap(
    document.reservations || "Sin observaciones ni reservas consignadas.",
    body,
    9.5,
  );
  ensure(Math.min(38 + reservationLines.length * 15, 160));
  paragraph("Observaciones y reservas", display, 13, 18, 4);
  paragraph(
    document.reservations || "Sin observaciones ni reservas consignadas.",
  );

  const signerLines = wrap(
    `${document.signer}\nDNI / CUIT ${document.signerId}`,
    body,
    9.5,
  );
  ensure(90 + signerLines.length * 15);
  y -= 40;
  page.drawLine({
    start: { x: PAGE.margin, y },
    end: { x: PAGE.margin + 260, y },
    color: ink,
    thickness: 0.7,
  });
  y -= 18;
  paragraph("Firma de quien recibe el pago", body, 9, 14, 5);
  paragraph(
    `${document.signer}\nDNI / CUIT ${document.signerId}`,
    body,
    9.5,
    15,
    0,
  );

  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    const footer = wrap(FISCAL_NOTICE, body, 8);
    footer.forEach((line, i) =>
      sheet.drawText(line, {
        x: PAGE.margin,
        y: 78 - i * 12,
        font: body,
        size: 8,
        color: muted,
      }),
    );
    sheet.drawLine({
      start: { x: PAGE.margin, y: 48 },
      end: { x: PAGE.width - PAGE.margin, y: 48 },
      thickness: 0.6,
      color: rule,
    });
    sheet.drawText("Factura", {
      x: PAGE.margin,
      y: 25,
      font: display,
      size: 17,
      color: ink,
    });
    sheet.drawText(".", {
      x: PAGE.margin + display.widthOfTextAtSize("Factura", 17),
      y: 25,
      font: display,
      size: 17,
      color: accent,
    });
    sheet.drawText("Generado por Factura.uno", {
      x: PAGE.margin + display.widthOfTextAtSize("Factura.", 17) + 14,
      y: 27,
      font: body,
      size: 8,
      color: ink,
    });
    const count = `${index + 1} / ${pages.length}`;
    sheet.drawText(count, {
      x: PAGE.width - PAGE.margin - body.widthOfTextAtSize(count, 8),
      y: 27,
      font: body,
      size: 8,
      color: muted,
    });
  });
  return new Uint8Array(await pdf.save());
}
