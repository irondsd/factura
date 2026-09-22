import { describe, expect, it } from "vitest";
import { parseSuggestion } from "./suggestion";

describe("parseSuggestion", () => {
  const base = {
    message: "  Sumen Metrogas.  ",
    email: " ana@example.com ",
    path: "/guias/tarifa-edesur",
  };

  it("trims the message and the address", () => {
    expect(parseSuggestion(base)).toEqual({
      message: "Sumen Metrogas.",
      email: "ana@example.com",
      path: "/guias/tarifa-edesur",
    });
  });

  it("rejects a missing, too short or too long message", () => {
    expect(parseSuggestion({ ...base, message: undefined })).toBeNull();
    expect(parseSuggestion({ ...base, message: " hi " })).toBeNull();
    expect(parseSuggestion({ ...base, message: "a".repeat(2001) })).toBeNull();
    expect(parseSuggestion(null)).toBeNull();
  });

  it("drops a bad address instead of rejecting the suggestion", () => {
    expect(parseSuggestion({ ...base, email: "nope" })?.email).toBeNull();
    expect(parseSuggestion({ ...base, email: "" })?.email).toBeNull();
    expect(parseSuggestion({ ...base, email: 42 })?.email).toBeNull();
  });

  it("keeps only a site-relative path", () => {
    const path = (p: unknown) => parseSuggestion({ ...base, path: p })?.path;
    expect(path("/estadisticas/tarifas-agua?x=1")).toBeNull();
    expect(path("//evil.example/x")).toBeNull();
    expect(path("https://evil.example")).toBeNull();
    expect(path("/a b")).toBeNull();
    expect(path(`/${"a".repeat(300)}`)).toBeNull();
    expect(path("/noticias/categoria/energia")).toBe(
      "/noticias/categoria/energia",
    );
  });
});
