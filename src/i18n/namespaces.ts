import type { Dictionary, Namespace } from "./config";

// Which parts of the dictionary each tree hands to its client components.
//
// Every namespace named here is serialized into the RSC payload of every route
// below the provider that names it, and on the public site that payload is then
// stored — see the note in `./I18nProvider`. So these lists are budgets, not
// conveniences: adding a namespace to `SITE_NAMESPACES` puts it on all ~180
// prerendered pages, whereas adding a nested provider to the one route that
// needs it puts it on one.

/** Narrow a dictionary to the namespaces a tree actually reads. */
export function pickNamespaces<K extends Namespace>(
  dictionary: Dictionary,
  namespaces: readonly K[],
): Pick<Dictionary, K> {
  const picked = {} as Pick<Dictionary, K>;
  for (const namespace of namespaces) picked[namespace] = dictionary[namespace];
  return picked;
}

/** What every public page carries, because the chrome in the `[lang]` layout
 * reads it wherever you are:
 *
 * - `meta` — the language-suggestion banner and the footer's language switch,
 * - `common` — the toast's close button,
 * - `notFound` — the 404 screen, which renders under this layout.
 *
 * Three namespaces, ~3 KB. Everything else a public route needs, it declares
 * itself. Think hard before adding a fourth. */
export const SITE_NAMESPACES = ["common", "meta", "notFound"] as const;
