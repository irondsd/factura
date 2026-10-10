import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

type MarkdownNode = {
  type: string;
  value?: string;
  alt?: string | null;
  children?: MarkdownNode[];
};

const parser = unified().use(remarkParse).use(remarkGfm);

/** Plain text for compact cards: keep readable Markdown text, without syntax,
 * link destinations, or HTML. Only a bounded prefix is needed for a preview. */
export function descriptionPreview(markdown: string): string {
  function text(node: MarkdownNode): string {
    if (["text", "inlineCode", "code"].includes(node.type))
      return node.value ?? "";
    if (["image", "imageReference"].includes(node.type)) return node.alt ?? "";
    if (node.type === "break") return "\n";
    const inline = [
      "paragraph",
      "heading",
      "link",
      "linkReference",
      "strong",
      "emphasis",
      "delete",
    ].includes(node.type);
    return (node.children ?? [])
      .map(text)
      .filter(Boolean)
      .join(inline ? "" : "\n");
  }

  const plain = text(parser.parse(markdown.slice(0, 2000)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const characters = Array.from(plain);
  return characters.length > 400
    ? `${characters.slice(0, 400).join("").trimEnd()}…`
    : plain;
}
