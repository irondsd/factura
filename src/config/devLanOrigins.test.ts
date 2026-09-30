import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devLanHosts, devLanOrigin } from "./devLanOrigins";

vi.mock("node:os", () => ({
  networkInterfaces: () => ({
    en0: [
      { family: "IPv4", internal: false, address: "192.168.1.33" },
      { family: "IPv6", internal: false, address: "fe80::1" },
    ],
    bridge: [{ family: "IPv4", internal: false, address: "10.0.0.4" }],
    public: [{ family: "IPv4", internal: false, address: "8.8.8.8" }],
  }),
}));

describe("dev LAN origins", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));
  afterEach(() => vi.unstubAllEnvs());

  it("allows only private addresses assigned to this machine", () => {
    expect(devLanHosts()).toEqual(["192.168.1.33", "10.0.0.4"]);
    expect(
      devLanOrigin("http://192.168.1.33:4000/cms", "http://localhost:4000"),
    ).toBe("http://192.168.1.33:4000");
    expect(devLanOrigin("http://192.168.1.34:4000", "http://localhost:4000")).toBeNull();
    expect(devLanOrigin("http://192.168.1.33:5000", "http://localhost:4000")).toBeNull();
  });

  it("does not allow LAN redirects in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(devLanHosts()).toEqual([]);
    expect(devLanOrigin("http://192.168.1.33:4000", "http://localhost:4000")).toBeNull();
  });
});
