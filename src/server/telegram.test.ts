import { describe, expect, it } from "vitest";
import { buildContactMessage, escapeMarkdownV2 } from "./telegram";

// What can break a channel post is the formatting, not the fetch: MarkdownV2
// fails the WHOLE request on one unescaped reserved character, and the text
// being escaped is typed by a stranger on a public form. These cover that.

describe("escapeMarkdownV2", () => {
  it("escapes every character Telegram reserves", () => {
    const reserved = "_*[]()~`>#+-=|{}.!\\";
    const escaped = escapeMarkdownV2(reserved);
    // Each one comes back preceded by a backslash and nothing else.
    expect(escaped).toBe([...reserved].map((c) => `\\${c}`).join(""));
  });

  it("escapes the punctuation of an ordinary sentence", () => {
    // The realistic failure: no markdown in sight, just a full stop and a dash.
    expect(escapeMarkdownV2("No pude subir la factura - se cayó.")).toBe(
      "No pude subir la factura \\- se cayó\\.",
    );
  });

  it("leaves letters, digits and accents alone", () => {
    expect(escapeMarkdownV2("Consumo 230 kWh en enero — ¿está bien?")).toBe(
      "Consumo 230 kWh en enero — ¿está bien?",
    );
  });
});

describe("buildContactMessage", () => {
  const base = {
    topic: "Support",
    name: "Ana Pérez",
    email: "ana@example.com",
    message: "Hola. No puedo subir mi factura de Edesur.",
    locale: "es" as const,
  };

  it("lays out the header and the body", () => {
    const text = buildContactMessage(base);
    expect(text).toContain("📬 *Contact form*");
    expect(text).toContain("*Topic:* Support");
    expect(text).toContain("*Name:* Ana Pérez");
    expect(text).toContain("*Email:* `ana@example.com`");
    expect(text).toContain("*Language:* es");
    expect(text).toContain("No puedo subir mi factura de Edesur\\.");
  });

  it("omits the optional lines rather than printing empty ones", () => {
    const text = buildContactMessage({ ...base, name: null, locale: null });
    expect(text).not.toContain("*Name:*");
    expect(text).not.toContain("*Language:*");
    expect(text).toContain("*Email:*");
  });

  it("does not let a visitor's text open a markdown entity", () => {
    const text = buildContactMessage({
      ...base,
      name: "*admin*",
      message: "See [this](http://evil.example) and `code`.",
    });
    // The only unescaped `*` are the ones this module wrote as labels.
    expect(text).toContain("\\*admin\\*");
    expect(text).toContain("\\[this\\]\\(http://evil\\.example\\)");
    expect(text).toContain("\\`code\\`");
  });

  it("keeps a maximum-length message under Telegram's ceiling", () => {
    // Every character escapes to two, which is the case a naive builder blows.
    const text = buildContactMessage({ ...base, message: ".".repeat(4000) });
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain("…");
  });

  it("never ends a truncated message on a half-written escape", () => {
    const text = buildContactMessage({ ...base, message: "-".repeat(4000) });
    // A trailing lone backslash is what would fail the send.
    const body = text.slice(0, -1); // drop the ellipsis
    expect(/\\$/.test(body)).toBe(false);
  });

  it("escapes an address that would otherwise close its code span", () => {
    const text = buildContactMessage({ ...base, email: "we`ird@example.com" });
    expect(text).toContain("`we\\`ird@example.com`");
  });
});
