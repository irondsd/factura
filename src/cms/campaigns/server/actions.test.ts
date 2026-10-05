import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  preview: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/cms/auth/requireCmsMember", () => ({
  requireCmsMember: mocks.gate,
}));
vi.mock("./store", () => ({
  cmsCampaignService: { preview: mocks.preview, send: mocks.send },
}));
vi.mock("@/server/email", () => ({
  CampaignDeliveryError: class extends Error {},
}));
import { previewCampaignAction, sendCampaignAction } from "./actions";
import { CampaignValidationError } from "../validation";

const input = {
  recipients: "ada@example.com",
  content: {
    subject: "Hola",
    title: "Hola",
    eyebrow: "Cuenta",
    preheader: "Hola",
    blocks: [],
  },
};
describe("campaign action authorization", () => {
  beforeEach(() => vi.resetAllMocks());
  it("requires a fresh CMS membership for previews and sends", async () => {
    mocks.gate.mockRejectedValue(new Error("not a member"));
    await expect(previewCampaignAction(input)).rejects.toThrow("not a member");
    await expect(sendCampaignAction(input, "request")).rejects.toThrow(
      "not a member",
    );
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.gate).toHaveBeenCalledWith("/cms/campaigns");
  });
  it("returns field-level errors for invalid recipients", async () => {
    mocks.gate.mockResolvedValue({ role: "editor" });
    mocks.send.mockRejectedValue(
      new CampaignValidationError({ recipients: "Usuario inexistente" }),
    );
    expect(await sendCampaignAction(input, "request")).toMatchObject({
      ok: false,
      errors: { recipients: "Usuario inexistente" },
    });
  });
});
