import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildContactMessage,
  buildSignInMessage,
  escapeMarkdownV2,
  shouldNotifySignIn,
  signInNoticeMode,
} from "./telegram";

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

describe("buildSignInMessage", () => {
  const notice = {
    email: "ana@example.com",
    name: "Ana Pérez",
    provider: "google",
    isNewUser: false,
    city: "Buenos Aires",
    country: "AR",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };

  it("lays out a returning sign-in", () => {
    const text = buildSignInMessage(notice);
    expect(text).toContain("👋 *Signed in*");
    expect(text).toContain("*Email:* `ana@example.com`");
    expect(text).toContain("*Name:* Ana Pérez");
    expect(text).toContain("*Via:* Google");
    expect(text).toContain("*From:* Buenos Aires, AR");
    expect(text).toContain("*Device:* Chrome on macOS");
    expect(text).not.toContain("*Accounts:*");
  });

  it("marks a new account and carries the running total", () => {
    const text = buildSignInMessage({
      ...notice,
      isNewUser: true,
      userCount: 47,
    });
    expect(text).toContain("🎉 *New account*");
    expect(text).toContain("*Accounts:* 47");
  });

  it("names the email-code provider in words rather than by its id", () => {
    expect(buildSignInMessage({ ...notice, provider: "resend" })).toContain(
      "*Via:* Email code",
    );
  });

  it("omits the lines local dev has no reading for", () => {
    // No edge in front means no city or country, and a sign-in from a script
    // has no UA — none of that should print an empty label.
    const text = buildSignInMessage({
      ...notice,
      name: null,
      city: null,
      country: null,
      userAgent: null,
    });
    expect(text).not.toContain("*Name:*");
    expect(text).not.toContain("*From:*");
    expect(text).not.toContain("*Device:*");
    expect(text).toContain("*Email:*");
  });

  it("prints just the country when that is all the edge resolved", () => {
    const text = buildSignInMessage({ ...notice, city: null });
    expect(text).toContain("*From:* AR");
  });

  it("does not let a display name open a markdown entity", () => {
    // A name comes from Google's profile or the user's own profile edit, so it
    // is no more trusted than the contact form's.
    const text = buildSignInMessage({ ...notice, name: "*admin* [x](y)" });
    expect(text).toContain("\\*admin\\* \\[x\\]\\(y\\)");
  });

  it("does not let an address close its code span", () => {
    const text = buildSignInMessage({ ...notice, email: "we`ird@example.com" });
    expect(text).toContain("`we\\`ird@example.com`");
  });

  it("says so rather than printing nothing when there is no address", () => {
    expect(buildSignInMessage({ ...notice, email: null })).toContain(
      "*Email:* `unknown`",
    );
  });
});

describe("signInNoticeMode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("posts only new accounts when unset", () => {
    vi.stubEnv("TELEGRAM_NOTIFY_SIGNINS", "");
    expect(signInNoticeMode()).toBe("new");
    expect(shouldNotifySignIn(true)).toBe(true);
    expect(shouldNotifySignIn(false)).toBe(false);
  });

  it("goes silent on off", () => {
    for (const value of ["off", "OFF", " false ", "0", "none", "no"]) {
      vi.stubEnv("TELEGRAM_NOTIFY_SIGNINS", value);
      expect(signInNoticeMode()).toBe("off");
      expect(shouldNotifySignIn(true)).toBe(false);
    }
  });

  it("keeps sign-ups but drops returning sign-ins on new", () => {
    vi.stubEnv("TELEGRAM_NOTIFY_SIGNINS", "new");
    expect(shouldNotifySignIn(true)).toBe(true);
    expect(shouldNotifySignIn(false)).toBe(false);
  });

  it("keeps returning sign-ins quiet on a value it does not recognize", () => {
    // A typo must not accidentally re-enable notices for existing accounts.
    vi.stubEnv("TELEGRAM_NOTIFY_SIGNINS", "of");
    expect(signInNoticeMode()).toBe("new");
    expect(shouldNotifySignIn(false)).toBe(false);
  });

  it("allows all sign-ins only as an explicit opt-in", () => {
    vi.stubEnv("TELEGRAM_NOTIFY_SIGNINS", "all");
    expect(signInNoticeMode()).toBe("all");
    expect(shouldNotifySignIn(false)).toBe(true);
  });
});
