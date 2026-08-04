import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./userAgent";

// Real strings, because the whole point of the parser is the overlap between
// them: every Chromium says "Safari", every fork says "Chrome", iOS says
// "Mac OS X", Android says "Linux".
const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/604.1",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  curl: "curl/8.7.1",
};

describe("parseUserAgent", () => {
  it("names the browser without being fooled by the compatibility tokens", () => {
    expect(parseUserAgent(UA.chromeMac).browser).toBe("Chrome");
    expect(parseUserAgent(UA.safariMac).browser).toBe("Safari");
    expect(parseUserAgent(UA.edgeWindows).browser).toBe("Edge");
    expect(parseUserAgent(UA.samsungAndroid).browser).toBe("Samsung Internet");
    expect(parseUserAgent(UA.firefoxWindows).browser).toBe("Firefox");
    // Chrome on iOS is WebKit underneath, but the user picked Chrome.
    expect(parseUserAgent(UA.chromeIphone).browser).toBe("Chrome");
  });

  it("names the system, preferring the specific claim", () => {
    expect(parseUserAgent(UA.chromeMac).os).toBe("macOS");
    expect(parseUserAgent(UA.safariIphone).os).toBe("iOS");
    expect(parseUserAgent(UA.safariIpad).os).toBe("iPadOS");
    expect(parseUserAgent(UA.chromeAndroid).os).toBe("Android");
    expect(parseUserAgent(UA.firefoxWindows).os).toBe("Windows");
    expect(parseUserAgent(UA.firefoxLinux).os).toBe("Linux");
  });

  it("returns nulls rather than a guess for anything it can't place", () => {
    expect(parseUserAgent(UA.curl)).toEqual({ browser: null, os: null });
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
    expect(parseUserAgent("")).toEqual({ browser: null, os: null });
  });
});
