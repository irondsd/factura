import type { ReactElement } from "react";
import { prerender } from "react-dom/static";

// Render a React tree to HTML in a test, including async server components.
//
// `renderToStaticMarkup` is the legacy synchronous renderer: it throws
// "A component suspended while responding to synchronous input" the moment the
// tree contains an async server component — and several of the site's content
// components are exactly that (`TrustBlock` reads its data). `prerender` is
// React 19's static renderer and awaits them, which is what the App Router does
// in production too.

export async function renderToHtml(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  const reader = prelude.getReader();
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}
