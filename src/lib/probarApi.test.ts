import { describe, expect, it } from "vitest";
import { probarApiUrl } from "./probarApi";

describe("probarApiUrl", () => {
  it("keeps relative API calls in the monolith", () => {
    expect(
      probarApiUrl("/submit", {
        siteOrigin: "http://localhost:4000",
        appOrigin: "http://localhost:4000",
      }),
    ).toBe("/api/probar/submit");
  });

  it("targets the app deployment after the split", () => {
    expect(
      probarApiUrl("/parse", {
        siteOrigin: "https://factura.uno",
        appOrigin: "https://app.factura.uno",
      }),
    ).toBe("https://app.factura.uno/api/probar/parse");
  });

  it.each(["submit", "//evil.example", "/submit/extra", "/submit?x=1"])(
    "rejects an invalid endpoint: %s",
    (endpoint) => expect(() => probarApiUrl(endpoint)).toThrow(),
  );
});
