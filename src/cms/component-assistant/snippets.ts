/** Turn a CodeMirror snippet into the source an author sees before filling its
 * tab stops. The assistant generates only simple `${number:default}` and
 * `${number}` fields, so this deliberately avoids becoming another snippet
 * parser. */
export function materializeSnippet(template: string): string {
  return template.replace(
    /\$\{(\d+)(?::([^}]*))?\}/g,
    (_match, _number: string, value?: string) => value ?? "",
  );
}

export function snippetField(number: number, value: string): string {
  return number === 0
    ? `\${0:${escapeSnippet(value)}}`
    : `\${${number}:${escapeSnippet(value)}}`;
}

function escapeSnippet(value: string): string {
  return value.replace(/[{}]/g, (character) => `\\${character}`);
}
