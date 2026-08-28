import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: { delete: vi.fn() },
}));

import { GET } from "./route";

describe("GET /logout", () => {
  it("turns the relative monolith fallback into an absolute redirect", async () => {
    const response = await GET(
      new NextRequest("http://localhost:4000/logout"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:4000/");
  });

  it("expires both possible Auth.js session cookie names", async () => {
    const response = await GET(
      new NextRequest("http://localhost:4000/logout"),
    );
    const cookies = response.headers.getSetCookie().join("\n");

    expect(cookies).toContain("authjs.session-token=");
    expect(cookies).toContain("__Secure-authjs.session-token=");
    expect(cookies).toContain("Max-Age=0");
  });
});
