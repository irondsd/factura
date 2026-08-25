import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildContactMessage,
  buildSignInMessage,
  buildUnrecognizedBillMessage,
  escapeMarkdownV2,
  sendTelegramDocument,
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

describe("buildUnrecognizedBillMessage", () => {
  const bill = {
    submissionId: "6f1c9c3e-0000-4000-8000-000000000001",
    fileName: "factura-marzo.pdf",
    fileBytes: 1_572_864,
    pageCount: 3,
    locale: "es" as const,
    vendorGuess: null,
    textPreview: "COOPERATIVA ELÉCTRICA DE ZÁRATE. Total a pagar $ 12.340,50",
  };

  it("lays out what the bill is", () => {
    const text = buildUnrecognizedBillMessage(bill);
    expect(text).toContain("🧾 *Unrecognized bill*");
    expect(text).toContain("*File:* `factura-marzo.pdf` — 1\\.5 MB, 3 pages");
    expect(text).toContain("*Language:* es");
    expect(text).toContain(`*Submission:* \`${bill.submissionId}\``);
    expect(text).toContain("COOPERATIVA ELÉCTRICA DE ZÁRATE\\.");
  });

  it("counts a single page in the singular and rounds small files to KB", () => {
    const text = buildUnrecognizedBillMessage({
      ...bill,
      pageCount: 1,
      fileBytes: 94_000,
    });
    expect(text).toContain("92 KB, 1 page");
  });

  it("omits the optional lines rather than printing empty ones", () => {
    const text = buildUnrecognizedBillMessage({
      ...bill,
      pageCount: null,
      locale: null,
    });
    expect(text).toContain("*File:* `factura-marzo.pdf` — 1\\.5 MB");
    expect(text).not.toContain("pages");
    expect(text).not.toContain("*Language:*");
    expect(text).not.toContain("*Says it's from:*");
  });

  it("carries the visitor's vendor guess when there is one", () => {
    const text = buildUnrecognizedBillMessage({
      ...bill,
      vendorGuess: "Aguas del Norte S.A.",
    });
    expect(text).toContain("*Says it's from:* Aguas del Norte S\\.A\\.");
  });

  it("links a presigned URL without escaping its signature", () => {
    // The full escaper would put backslashes inside the query string and break
    // the download; only `)` and `\` are reserved inside the link's parens.
    const url =
      "https://bucket.r2.example/submissions/x-y.pdf?X-Amz-Signature=ab-cd_ef&X-Amz-Expires=604800";
    const text = buildUnrecognizedBillMessage({ ...bill, downloadUrl: url });
    expect(text).toContain(`*Download:* [stored PDF](${url})`);
  });

  it("fits a caption even when the bill's text is enormous", () => {
    // Every character escapes to two, and a caption's ceiling is a quarter of a
    // message's — this is the case that would silently lose the whole post.
    const text = buildUnrecognizedBillMessage({
      ...bill,
      textPreview: ".".repeat(4000),
    });
    expect(text.length).toBeLessThanOrEqual(1024);
    expect(text).toContain("…");
    expect(/\\$/.test(text.slice(0, -1))).toBe(false);
  });

  it("drops the preview rather than the header when there is no room", () => {
    const text = buildUnrecognizedBillMessage({
      ...bill,
      fileName: "x".repeat(1000),
    });
    expect(text.length).toBeLessThanOrEqual(1024);
    expect(text).toContain("🧾 *Unrecognized bill*");
  });

  it("does not let a file name close its code span", () => {
    const text = buildUnrecognizedBillMessage({
      ...bill,
      fileName: "we`ird`.pdf",
    });
    expect(text).toContain("`we\\`ird\\`.pdf`");
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

describe("sendTelegramDocument", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const file = { bytes: new Uint8Array([1, 2, 3, 4]), fileName: "bill.pdf" };

  const configured = (...responses: Response[]) => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "-1001234567890");
    const calls = [...responses];
    const mock = vi.fn(async () => calls.shift() ?? new Response("{}"));
    vi.stubGlobal("fetch", mock);
    return mock;
  };

  it("posts the bytes as a multipart document with the caption", async () => {
    const fetchMock = configured(new Response("{}", { status: 200 }));

    const res = await sendTelegramDocument(file, "🧾 *Unrecognized bill*");
    expect(res).toEqual({ ok: true, skipped: false });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendDocument");
    const body = init.body as FormData;
    expect(body.get("chat_id")).toBe("-1001234567890");
    expect(body.get("caption")).toBe("🧾 *Unrecognized bill*");
    expect(body.get("parse_mode")).toBe("MarkdownV2");
    // The part Telegram actually files as the document: right name, right bytes.
    const doc = body.get("document") as File;
    expect(doc.name).toBe("bill.pdf");
    expect(doc.type).toBe("application/pdf");
    expect(new Uint8Array(await doc.arrayBuffer())).toEqual(file.bytes);
  });

  it("re-sends the same bytes unformatted after a 400", async () => {
    // A consumed multipart body can't be replayed, so the retry has to rebuild
    // it — this is the case that would drop the bill rather than its formatting.
    const fetchMock = configured(
      new Response("can't parse entities", { status: 400 }),
      new Response("{}", { status: 200 }),
    );

    const res = await sendTelegramDocument(file, "*caption*");
    expect(res).toEqual({ ok: true, skipped: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retry = (
      fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    )[1].body as FormData;
    expect(retry.get("parse_mode")).toBeNull();
    expect((retry.get("document") as File).size).toBe(4);
  });

  it("skips without a channel instead of failing the caller", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendTelegramDocument(file, "caption")).toEqual({
      ok: true,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
