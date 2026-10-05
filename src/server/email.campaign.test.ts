import { afterEach, describe, expect, it, vi } from "vitest";

const batchSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    batch = { send: batchSend };
  },
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { CampaignDeliveryError, sendCampaignEmails } from "./email";

const messages = [
  { to: "ada@example.com", subject: "Hola", html: "<p>Hola</p>" },
];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("campaign Resend adapter", () => {
  it("reports a missing API key without attempting delivery", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendCampaignEmails(messages, "campaign/test")).rejects.toThrow(
      "Resend no está configurado",
    );
    expect(batchSend).not.toHaveBeenCalled();
  });
  it("uses the configured sender, strict validation, and an idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    batchSend.mockResolvedValue({
      data: { data: [{ id: "email-1" }] },
      error: null,
    });
    expect(await sendCampaignEmails(messages, "campaign/test")).toEqual([
      "email-1",
    ]);
    expect(batchSend).toHaveBeenCalledWith(
      [{ from: expect.any(String), ...messages[0] }],
      { idempotencyKey: "campaign/test", batchValidation: "strict" },
    );
  });
  it("surfaces provider and transport failures", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    batchSend.mockResolvedValue({ data: null, error: { message: "rejected" } });
    await expect(
      sendCampaignEmails(messages, "campaign/test"),
    ).rejects.toBeInstanceOf(CampaignDeliveryError);
    batchSend.mockRejectedValue(new Error("timeout"));
    await expect(sendCampaignEmails(messages, "campaign/test")).rejects.toThrow(
      "No se pudo confirmar",
    );
    log.mockRestore();
  });
});
