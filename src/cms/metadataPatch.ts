// A partial edit to a page's metadata, applied to what is stored (cms.md).
//
// The browser form always sends the whole object: it renders every field, so a
// field left blank is a field the editor cleared, and replacing is right. An
// agent is in the opposite position. It edits one key — the FAQ, the
// locations — often starting from a `list_content` row that leaves the FAQ
// and the sources out on purpose, and a replace then silently deleted
// whatever it had not repeated. So the MCP sends a *patch*: keys it names are
// set, keys it omits are kept, and removal is explicit.
//
// Shallow on purpose. A top-level key's value is replaced whole — `faq`,
// `sources`, `provider` and `methodology` included — because a half-merged
// list of questions or a card with fields from two versions is not a state
// anyone asked for. Changing one FAQ entry means sending the whole `faq`.

/** A metadata patch: a value sets the key, `null` removes it, and a key that is
 * absent is left as it is. */
export type MetadataPatch = Readonly<Record<string, unknown>>;

export function applyMetadataPatch(
  current: unknown,
  patch: MetadataPatch,
): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete base[key];
    else if (value !== undefined) base[key] = value;
  }
  return base;
}
