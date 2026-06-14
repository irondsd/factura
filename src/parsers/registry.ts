import { dominijanniExpensasParser } from "./dominijanni-expensas";
import { edesurParser } from "./edesur";
import { mdaExpensasParser } from "./mda-expensas";
import { metrogasParser } from "./metrogas";
import { telecomParser } from "./telecom";
import type { VendorParser } from "./types";

export const parserRegistry: VendorParser[] = [
  edesurParser,
  metrogasParser,
  telecomParser,
  mdaExpensasParser,
  dominijanniExpensasParser,
];

export function findParser(normalizedText: string): VendorParser | undefined {
  return parserRegistry.find((p) => p.detect(normalizedText));
}
