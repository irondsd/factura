import type { ParserConfig } from "../types";
import { dominijanniExpensasConfig } from "./dominijanni-expensas";
import { edesurConfig } from "./edesur";
import { mdaExpensasConfig } from "./mda-expensas";
import { metrogasConfig } from "./metrogas";
import { telecomConfig } from "./telecom";

/** The seed presets. In production these are rows in the `parser_configs` table;
 * here they double as the engine's regression corpus. */
export const ENGINE_CONFIGS: ParserConfig[] = [
  edesurConfig,
  metrogasConfig,
  telecomConfig,
  mdaExpensasConfig,
  dominijanniExpensasConfig,
];
