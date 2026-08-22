import { describe, expect, it } from "vitest";
import type { CmsActor } from "../types";
import {
  canAuthor,
  canManageTokens,
  canPublish,
  resolveCmsAccess,
} from "./policy";

const admin: CmsActor = {
  userId: "u1",
  email: "a@example.com",
  name: "Ada",
  role: "admin",
};
const editor: CmsActor = {
  userId: "u2",
  email: "e@example.com",
  name: "Eve",
  role: "editor",
};

describe("resolveCmsAccess", () => {
  it("treats a request with no session as anonymous", () => {
    // The one case that gets sent to /login rather than a 404: not being signed
    // in is fixable by the visitor, not being on the allowlist isn't.
    expect(resolveCmsAccess(null, null)).toEqual({ kind: "anonymous" });
  });

  it("stays anonymous even if a membership row is somehow passed", () => {
    // Defends the ordering: identity first, then authority. A membership row
    // can never stand in for a session.
    expect(resolveCmsAccess(null, { role: "admin" })).toEqual({
      kind: "anonymous",
    });
  });

  it("forbids a signed-in account with no membership", () => {
    expect(resolveCmsAccess({ id: "u9" }, null)).toEqual({
      kind: "forbidden",
      userId: "u9",
    });
  });

  it("forbids a removed member", () => {
    // Revocation is deleting the row, so a removed member is indistinguishable
    // from a stranger *by design* — this test is what pins that down. Anything
    // that cached the role would break here.
    const before = resolveCmsAccess({ id: "u2" }, { role: "editor" });
    expect(before.kind).toBe("member");
    expect(resolveCmsAccess({ id: "u2" }, null)).toEqual({
      kind: "forbidden",
      userId: "u2",
    });
  });

  it("admits an editor with their role, name and email", () => {
    expect(
      resolveCmsAccess(
        { id: "u2", email: "e@example.com", name: "Eve" },
        { role: "editor" },
      ),
    ).toEqual({
      kind: "member",
      actor: editor,
    });
  });

  it("admits an admin", () => {
    expect(
      resolveCmsAccess(
        { id: "u1", email: "a@example.com", name: "Ada" },
        { role: "admin" },
      ),
    ).toEqual({
      kind: "member",
      actor: admin,
    });
  });

  it("normalizes a missing session email and name to null", () => {
    // A Google account always has both; an account created some other way may
    // have neither. `CmsActor.email` and `.name` are display-only, so absent
    // must not become `undefined` and leak into a template as "undefined" —
    // the CMS header falls back email-then-user-id on `null`, not on
    // `undefined`.
    const access = resolveCmsAccess({ id: "u3" }, { role: "editor" });
    expect(access).toEqual({
      kind: "member",
      actor: { userId: "u3", email: null, name: null, role: "editor" },
    });
  });
});

describe("CMS capabilities", () => {
  it("lets only an admin manage API tokens", () => {
    expect(canManageTokens(admin)).toBe(true);
    expect(canManageTokens(editor)).toBe(false);
  });

  it("lets both roles author", () => {
    expect(canAuthor(admin)).toBe(true);
    expect(canAuthor(editor)).toBe(true);
  });

  it("lets both roles publish in iteration 1", () => {
    // cms.md records this as a policy toggle, not a fixed rule. If
    // publishing is ever narrowed to admins, this is the test that should fail
    // first and be updated deliberately.
    expect(canPublish(admin)).toBe(true);
    expect(canPublish(editor)).toBe(true);
  });
});
