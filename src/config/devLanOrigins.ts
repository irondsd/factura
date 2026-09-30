import { networkInterfaces } from "node:os";

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168))
  );
}

/** Addresses on this machine that can serve the local dev site to LAN clients. */
export function devLanHosts(): string[] {
  if (process.env.NODE_ENV !== "development") return [];

  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flatMap((addresses) => addresses ?? [])
        .filter(
          (address) =>
            address.family === "IPv4" &&
            !address.internal &&
            isPrivateIpv4(address.address),
        )
        .map((address) => address.address),
    ),
  ];
}

/** Auth.js may return to a LAN URL only when it names this dev server. */
export function devLanOrigin(value: string, baseUrl: string): string | null {
  if (process.env.NODE_ENV !== "development") return null;

  try {
    const url = new URL(value);
    const server = new URL(baseUrl);
    if (
      url.protocol === "http:" &&
      url.port === server.port &&
      !url.username &&
      !url.password &&
      devLanHosts().includes(url.hostname)
    ) {
      return url.origin;
    }
  } catch {
    // A malformed request origin must not become an auth redirect target.
  }
  return null;
}
