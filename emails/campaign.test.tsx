import { render } from "@react-email/render";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { CampaignEmail, CHROME, type CampaignContent } from "./campaign";

/** Rendered text with the markup stripped, so assertions read like an inbox. */
async function renderText(element: React.ReactElement): Promise<string> {
  const html = await render(element);
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

const content: CampaignContent = {
  subject: "asunto",
  preheader: "preheader",
  eyebrow: "Primeros pasos",
  title: "Falta una factura.",
  blocks: [
    { type: "text", text: "Hola {name}." },
    {
      type: "signature",
      name: "Konstantin Mednikov",
      role: "fundador de Factura",
    },
  ],
};

describe("CampaignEmail", () => {
  it("takes its chrome from the locale, not a dictionary", async () => {
    const text = await renderText(
      <CampaignEmail locale="es" content={content} vars={{ name: "Ada" }} />,
    );
    expect(text).toContain("Hola Ada.");
    expect(text).toContain("Enviado personalmente por");
    expect(text).toContain("fundador de Factura");
    expect(text).toContain(CHROME.es.footerTagline);
    expect(text).toContain(CHROME.es.footerNote);
    expect(text).toContain(CHROME.es.headerTag);
  });

  it("renders the English chrome for an English send", async () => {
    const text = await renderText(
      <CampaignEmail
        locale="en"
        content={{
          ...content,
          blocks: [
            { type: "text", text: "Hi {name}." },
            {
              type: "signature",
              name: "Konstantin Mednikov",
              role: "founder of Factura",
            },
          ],
        }}
        vars={{ name: "Ada" }}
      />,
    );
    expect(text).toContain("Sent personally by");
    expect(text).toContain("founder of Factura");
    expect(text).toContain(CHROME.en.footerTagline);
    expect(text).toContain(CHROME.en.headerTag);
    // The shell's hardcoded fallbacks are English, so a Spanish leak here
    // would be invisible — assert the Spanish chrome is absent both ways.
    expect(text).not.toContain(CHROME.es.footerTagline);
  });

  it("sets <Html lang> from the locale", async () => {
    const html = await render(<CampaignEmail locale="es" content={content} />);
    expect(html).toContain('lang="es"');
  });

  it("lets a send override one chrome field without losing the rest", async () => {
    const text = await renderText(
      <CampaignEmail
        locale="es"
        content={{
          ...content,
          footerNote: "Te escribo porque te registraste.",
        }}
      />,
    );
    expect(text).toContain("Te escribo porque te registraste.");
    expect(text).not.toContain(CHROME.es.footerNote);
    expect(text).toContain(CHROME.es.footerTagline);
  });

  it("keeps the locale default when a chrome field is explicitly undefined", async () => {
    // A content object built from a form or a spread can carry explicit
    // undefined; letting that through would erase the default and fall back to
    // the shell's English string.
    const text = await renderText(
      <CampaignEmail
        locale="es"
        content={{ ...content, footerNote: undefined }}
      />,
    );
    expect(text).toContain(CHROME.es.footerNote);
  });

  it("renders every block type", async () => {
    const text = await renderText(
      <CampaignEmail
        locale="es"
        content={{
          ...content,
          blocks: [
            {
              type: "text",
              text: "Un **párrafo** con [link](https://x.test).",
            },
            { type: "list", items: ["Primero", "Segundo"] },
            {
              type: "button",
              label: "Subí tu factura",
              href: "https://x.test",
            },
            { type: "note", text: "Una nota al pie." },
            {
              type: "signature",
              name: "Konstantin Mednikov",
              role: "fundador de Factura",
            },
          ],
        }}
      />,
    );
    for (const probe of [
      "párrafo",
      "link",
      "Primero",
      "Segundo",
      "Subí tu factura",
      "Una nota al pie.",
      "Konstantin Mednikov",
    ]) {
      expect(text).toContain(probe);
    }
  });
});
