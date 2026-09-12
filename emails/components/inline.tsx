/**
 * Inline markup for campaign copy — two markers, no nesting, on purpose.
 *
 * Campaign bodies are content rather than code: today they arrive as a props
 * object, and if the /cms form lands they arrive from a textarea a human typed.
 * Full markdown is the fragile choice *here* specifically because email bodies
 * carry no stylesheet — every element in this folder is styled inline, so the
 * bare <p>/<a>/<ul> a markdown renderer emits would land unstyled and need a
 * node-type mapper anyway, plus every edge case an author can type (tables,
 * nested lists, raw HTML, images) with nothing to validate the result against.
 *
 * This grammar is small enough to test exhaustively, and it fails closed:
 * anything unrecognised stays literal instead of breaking the email.
 *
 *   **bold**              → <strong>
 *   [label](https://…)    → <Link>, accent-coloured per the brand rule
 *
 * There is no recursion. A marker inside a link label is literal text.
 */

import { Link } from "@react-email/components";
import * as React from "react";
import { styles } from "./factura-email";

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; value: string; href: string };

// Both alternatives use negated classes, not lazy dots: the match can't run
// past its own closing marker, and there's no nested quantifier to blow up on
// pathological input.
const INLINE = /\*\*([^*]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Schemes that are safe behind an anchor in a mail client. Anything else —
 * `javascript:`, `data:`, a bare relative path that would resolve against the
 * mail client's own origin — is refused. */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** Split campaign copy into styled runs. Pure, so the grammar is what the
 * tests pin down; `<Inline>` below is the only part that needs React. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    if (value) tokens.push({ type: "text", value });
  };

  for (const match of text.matchAll(INLINE)) {
    const [whole, bold, label, href] = match;
    pushText(text.slice(cursor, match.index));
    cursor = match.index + whole.length;

    if (bold !== undefined) {
      tokens.push({ type: "bold", value: bold });
    } else if (SAFE_HREF.test(href)) {
      tokens.push({ type: "link", value: label, href });
    } else {
      // Keep the label so the sentence still reads; drop only the anchor.
      pushText(label);
    }
  }

  pushText(text.slice(cursor));
  return tokens;
}

/** Render one line of campaign copy. Sits inside a <Text>, never around it. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((token, index) => {
        const key = `${index}-${token.type}`;
        switch (token.type) {
          case "bold":
            return (
              <strong key={key} style={{ fontWeight: 600 }}>
                {token.value}
              </strong>
            );
          case "link":
            return (
              <Link key={key} href={token.href} style={styles.accentLink}>
                {token.value}
              </Link>
            );
          default:
            return <React.Fragment key={key}>{token.value}</React.Fragment>;
        }
      })}
    </>
  );
}
