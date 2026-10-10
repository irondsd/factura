import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { buildContract, CONTRACT_VERSION, type ContractData } from "./model";

const PAGE = { width: 595.28, height: 841.89, margin: 54, bottom: 88 };
const palette = {
  paper: rgb(244 / 255, 239 / 255, 227 / 255),
  line: rgb(221 / 255, 210 / 255, 187 / 255),
  ink: rgb(33 / 255, 29 / 255, 22 / 255),
  muted: rgb(100 / 255, 90 / 255, 71 / 255),
  accent: rgb(217 / 255, 72 / 255, 15 / 255),
};

async function asset(path: string): Promise<ArrayBuffer> {
  const response = await fetch(`/fonts/contract/${path}`);
  if (!response.ok)
    throw new Error(
      "No pudimos cargar las fuentes del PDF. Revisá tu conexión y volvé a generar el documento.",
    );
  return response.arrayBuffer();
}

/** Real text and embedded fonts, not screenshots. Personal data never leaves the browser. */
export async function generateContractPdf(
  data: ContractData,
): Promise<Uint8Array<ArrayBuffer>> {
  const document = buildContract(data);
  const [displayBytes, bodyBytes] = await Promise.all([
    asset("Fraunces-SemiBold.ttf"),
    asset("IBMPlexMono-Regular.ttf"),
  ]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const display = await pdf.embedFont(displayBytes, { subset: true });
  const body = await pdf.embedFont(bodyBytes, { subset: true });
  pdf.setTitle(document.title);
  pdf.setAuthor("Factura.uno");
  pdf.setCreator(`Factura.uno - modelo ${CONTRACT_VERSION}`);
  pdf.setSubject(
    "Contrato generado a partir de los datos ingresados por el usuario. Documento para revisión y firma de las partes.",
  );
  pdf.setLanguage("es-AR");

  let page: PDFPage;
  let y = 0;
  const width = PAGE.width - PAGE.margin * 2;
  const clean = (text: string) =>
    text.normalize("NFC").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");

  function lines(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth = width,
  ): string[] {
    const content = clean(text);
    const characters = new Set(font.getCharacterSet());
    for (const character of content) {
      if (!/\s/.test(character) && !characters.has(character.codePointAt(0)!)) {
        throw new Error(
          `El PDF no admite el carácter «${character}». Reemplazalo en el formulario y volvé a generar el documento.`,
        );
      }
    }
    const result: string[] = [];
    for (const paragraph of content.split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) {
          result.push(current);
          current = "";
        }
        // Addresses, IDs and aliases can contain a long run with no spaces.
        for (const character of word) {
          if (font.widthOfTextAtSize(current + character, size) > maxWidth) {
            result.push(current);
            current = "";
          }
          current += character;
        }
      }
      result.push(current.trimEnd());
    }
    return result;
  }

  function newPage() {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE.width,
      height: PAGE.height,
      color: palette.paper,
    });
    // Same 22px pitch and 0.75px dot as .paper-grid, converted to PDF points.
    for (let x = 8.25; x < PAGE.width; x += 16.5) {
      for (let dotY = 8.25; dotY < PAGE.height; dotY += 16.5) {
        page.drawCircle({ x, y: dotY, size: 0.5625, color: palette.line });
      }
    }
    if (pdf.getPageCount() > 1) {
      page.drawText(document.title, {
        x: PAGE.margin,
        y: PAGE.height - 41,
        size: 11,
        font: display,
        color: palette.ink,
      });
      page.drawLine({
        start: { x: PAGE.margin, y: PAGE.height - 53 },
        end: { x: PAGE.width - PAGE.margin, y: PAGE.height - 53 },
        thickness: 0.6,
        color: palette.line,
      });
      y = PAGE.height - 80;
    } else y = PAGE.height - 64;
  }

  function ensure(height: number) {
    if (y - height < PAGE.bottom) newPage();
  }

  function paragraph(
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      leading?: number;
      color?: ReturnType<typeof rgb>;
      gap?: number;
    } = {},
  ) {
    const {
      font = body,
      size = 9.5,
      leading = 14.5,
      color = palette.ink,
      gap = 10,
    } = options;
    for (const line of lines(text, font, size)) {
      ensure(leading);
      if (line) page.drawText(line, { x: PAGE.margin, y, size, font, color });
      y -= leading;
    }
    y -= gap;
  }

  newPage();
  paragraph(document.title, { font: display, size: 26, leading: 30, gap: 8 });
  paragraph(document.subtitle, { size: 9, color: palette.muted, gap: 12 });
  page!.drawLine({
    start: { x: PAGE.margin, y: y + 5 },
    end: { x: PAGE.margin + 44, y: y + 5 },
    thickness: 2,
    color: palette.accent,
  });
  y -= 10;
  paragraph(document.introduction, { gap: 14 });
  for (const section of document.sections) {
    const headingLines = lines(section.title, display, 13);
    ensure(headingLines.length * 17 + 3 * 14.5);
    paragraph(section.title, { font: display, size: 13, leading: 17, gap: 5 });
    paragraph(section.text, { gap: 14 });
  }
  const signatureIntro =
    "En prueba de conformidad, las partes firman este contrato y su Anexo I, en ejemplares de un mismo tenor, conservando uno cada parte. Las personas representantes y fiadoras firman en el carácter indicado.";
  const columnWidth = (width - 28) / 2;
  const signatureRows = [];
  for (let i = 0; i < document.signatures.length; i += 2) {
    const columns = document.signatures
      .slice(i, i + 2)
      .map(({ role, person }) => ({
        role,
        details: lines(
          `${person.name}\n${person.id}${person.kind === "sociedad" ? `\nFirma por la sociedad: ${person.representative}` : ""}`,
          body,
          9,
          columnWidth,
        ),
      }));
    signatureRows.push({
      columns,
      height: 76 + Math.max(...columns.map((c) => c.details.length)) * 13,
    });
  }
  const signatureHeight =
    39 +
    lines(signatureIntro, body, 9.5).length * 14.5 +
    signatureRows.reduce((sum, row) => sum + row.height, 0);
  // Keep a normal set of signers together. Larger groups continue by whole row.
  ensure(Math.min(signatureHeight, PAGE.height - 80 - PAGE.bottom));
  paragraph("Firmas de las partes", {
    font: display,
    size: 16,
    leading: 21,
    gap: 8,
  });
  paragraph(signatureIntro);
  for (const row of signatureRows) {
    ensure(row.height);
    row.columns.forEach((column, index) => {
      const x = PAGE.margin + index * (columnWidth + 28);
      const lineY = y - 34;
      page!.drawLine({
        start: { x, y: lineY },
        end: { x: x + columnWidth, y: lineY },
        thickness: 0.7,
        color: palette.ink,
      });
      page!.drawText(column.role, {
        x,
        y: lineY - 18,
        size: 11,
        font: display,
        color: palette.ink,
      });
      column.details.forEach((line, lineIndex) => {
        if (line)
          page!.drawText(line, {
            x,
            y: lineY - 35 - lineIndex * 13,
            size: 9,
            font: body,
            color: palette.ink,
          });
      });
    });
    y -= row.height;
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: PAGE.margin, y: 57 },
      end: { x: PAGE.width - PAGE.margin, y: 57 },
      thickness: 0.6,
      color: palette.line,
    });
    const wordmarkSize = 17;
    const wordmarkWidth = display.widthOfTextAtSize("Factura.", wordmarkSize);
    p.drawText("Factura", {
      x: PAGE.margin,
      y: 32,
      font: display,
      size: wordmarkSize,
      color: palette.ink,
    });
    p.drawText(".", {
      x: PAGE.margin + display.widthOfTextAtSize("Factura", wordmarkSize),
      y: 32,
      font: display,
      size: wordmarkSize,
      color: palette.accent,
    });
    p.drawText("Generado por Factura.uno", {
      x: PAGE.margin + wordmarkWidth + 14,
      y: 34,
      font: body,
      size: 8,
      color: palette.ink,
    });
    const count = `${index + 1} / ${pages.length}`;
    p.drawText(count, {
      x: PAGE.width - PAGE.margin - body.widthOfTextAtSize(count, 8),
      y: 34,
      font: body,
      size: 8,
      color: palette.muted,
    });
  });
  return new Uint8Array(await pdf.save());
}
