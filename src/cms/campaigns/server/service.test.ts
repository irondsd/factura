import { describe, expect, it, vi } from "vitest";
import type { CmsActor } from "@/cms/types";
import { CmsForbiddenError } from "@/cms/server/errors";
import { CampaignValidationError, validateCampaign } from "../validation";
import { CmsCampaignService } from "./service";

const actor: CmsActor = {
  userId: "editor",
  email: "editor@example.com",
  name: null,
  role: "editor",
};
const requestId = "57a9f5d2-4f7d-4c9a-b77a-48c4e8db4b00";
const input = {
  recipients: "ADA@example.com; grace@example.com\nada@example.com",
  content: {
    subject: "Hola {name}",
    preheader: "Novedades",
    eyebrow: "Cuenta",
    title: "Tu registro",
    blocks: [
      { type: "text" as const, text: "Hola {name}, tu correo es {email}." },
    ],
  },
};
function fixture() {
  const deps = {
    findRecipients: vi.fn().mockResolvedValue([
      { email: "Ada@example.com", name: "Ada" },
      { email: "grace@example.com", name: null },
    ]),
    render: vi
      .fn()
      .mockImplementation(
        async (_content, recipient) => `<p>${recipient.email}</p>`,
      ),
    send: vi.fn().mockResolvedValue(["id-1", "id-2"]),
  };
  return { deps, service: new CmsCampaignService(deps) };
}

describe("manual campaign validation", () => {
  it("normalizes case, separators, and duplicate addresses", () => {
    expect(validateCampaign(input).emails).toEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
  });
  it.each([
    "not-an-email",
    "",
    Array.from({ length: 101 }, (_, n) => `user${n}@example.com`).join(","),
  ])("rejects invalid or unbounded recipient lists", (recipients) => {
    expect(() => validateCampaign({ ...input, recipients })).toThrow(
      CampaignValidationError,
    );
  });
  it("rejects missing content, unknown placeholders, and unsafe button URLs", () => {
    for (const content of [
      { ...input.content, title: "" },
      { ...input.content, title: "Hola {unknown}" },
      { ...input.content, headerTag: "{role}" },
      { ...input.content, signatureLine: "{email}" },
      { ...input.content, blocks: [] },
      {
        ...input.content,
        blocks: [{ type: "button", label: "Ir", href: "javascript:alert(1)" }],
      },
      {
        ...input.content,
        blocks: [{ type: "button", label: "Ir", href: "/app" }],
      },
      {
        ...input.content,
        blocks: [{ type: "button", label: "Ir", href: "https:example.com" }],
      },
      { ...input.content, blocks: [{ type: "list", items: ["Uno", " "] }] },
      { ...input.content, blocks: [{ type: "note", text: "{unknown}" }] },
      {
        ...input.content,
        blocks: [{ type: "signature", name: "{name}", role: "Fundador" }],
      },
    ])
      expect(() => validateCampaign({ ...input, content })).toThrow(
        CampaignValidationError,
      );
  });
  it("supports all five block types and distinguishes sender placeholders", () => {
    expect(() =>
      validateCampaign({
        ...input,
        content: {
          ...input.content,
          signatureLine: "Enviado por **{name}**, {role}.",
          blocks: [
            { type: "text", text: "Hola {name}" },
            { type: "list", items: ["Tu correo: {email}"] },
            { type: "button", label: "Abrir", href: "https://example.com/app" },
            { type: "note", text: "Gracias" },
            { type: "signature", name: "Konstantin", role: "Fundador" },
          ],
        },
      }),
    ).not.toThrow();
  });
});

describe("CmsCampaignService", () => {
  it("blocks non-members before database reads or delivery", async () => {
    const { service, deps } = fixture();
    await expect(
      service.send(
        { ...actor, role: "stranger" } as unknown as CmsActor,
        input,
        requestId,
      ),
    ).rejects.toBeInstanceOf(CmsForbiddenError);
    expect(deps.findRecipients).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("rejects the whole campaign when even one address is not a registered user", async () => {
    const { service, deps } = fixture();
    deps.findRecipients.mockResolvedValue([
      { email: "Ada@example.com", name: "Ada" },
    ]);
    await expect(service.send(actor, input, requestId)).rejects.toMatchObject({
      errors: { recipients: expect.stringContaining("grace@example.com") },
    });
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("previews personalized copy without sending", async () => {
    const { service, deps } = fixture();
    const preview = await service.preview(actor, input);
    expect(preview.subject).toBe("Hola Ada");
    expect(preview.recipients).toEqual([
      "Ada@example.com",
      "grace@example.com",
    ]);
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("revalidates membership in the user directory at send time", async () => {
    const { service, deps } = fixture();
    await service.preview(actor, input);
    deps.findRecipients.mockResolvedValue([]);
    await expect(service.send(actor, input, requestId)).rejects.toBeInstanceOf(
      CampaignValidationError,
    );
    expect(deps.send).not.toHaveBeenCalled();
  });
  it("sends one separate personalized message per unique registered address", async () => {
    const { service, deps } = fixture();
    expect(await service.send(actor, input, requestId)).toEqual({ count: 2 });
    expect(deps.send.mock.calls[0][0]).toEqual([
      {
        to: "Ada@example.com",
        subject: "Hola Ada",
        html: "<p>Ada@example.com</p>",
      },
      {
        to: "grace@example.com",
        subject: "Hola grace@example.com",
        html: "<p>grace@example.com</p>",
      },
    ]);
  });
  it("reuses the idempotency key on retries and changes it for edited campaigns", async () => {
    const { service, deps } = fixture();
    await service.send(actor, input, requestId);
    await service.send(actor, input, requestId);
    await service.send(
      actor,
      { ...input, content: { ...input.content, title: "Nuevo título" } },
      requestId,
    );
    expect(deps.send.mock.calls[0][1]).toBe(deps.send.mock.calls[1][1]);
    expect(deps.send.mock.calls[0][1]).not.toBe(deps.send.mock.calls[2][1]);
  });
  it("surfaces delivery failures instead of reporting success", async () => {
    const { service, deps } = fixture();
    deps.send.mockRejectedValue(new Error("Resend failed"));
    await expect(service.send(actor, input, requestId)).rejects.toThrow(
      "Resend failed",
    );
  });
});
