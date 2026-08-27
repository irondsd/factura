/** Turn a CodeMirror snippet into the source an author sees before filling its
 * tab stops. The assistant generates only simple `${number:default}` and
 * `${number}` fields, so this deliberately avoids becoming another snippet
 * parser. */
export function materializeSnippet(template: string): string {
  return template.replace(
    /\$\{(\d+)(?::([^{}]*))?\}/g,
    (_match, _number: string, value?: string) => value ?? "",
  );
}

/** CodeMirror parses snippets line by line and its numbered-field syntax has no
 * escape for braces, so a field's default must be single-line and brace-free.
 * Callers split multi-line placeholders into one field per line; the
 * round-trip test in `descriptors.test.ts` proves every generated snippet
 * expands back to its own preview, which is what catches a violation. */
export function snippetField(number: number, value: string): string {
  return `\${${number}:${value}}`;
}
