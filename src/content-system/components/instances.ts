import { parseContentBody } from "../validation/parse";

type Node = {
  type: string;
  name?: string | null;
  children?: Node[];
  attributes?: Attribute[];
};

type Attribute = {
  type: string;
  name?: string;
  value?: unknown;
};

function literalProps(node: Node): Record<string, unknown> | null {
  const props: Record<string, unknown> = {};
  for (const attribute of node.attributes ?? []) {
    if (attribute.type === "mdxJsxExpressionAttribute") return null;
    if (!attribute.name) return null;
    if (attribute.value !== null && typeof attribute.value === "object") {
      return null;
    }
    const value = attribute.value ?? true;
    props[attribute.name] =
      value === "true" ? true : value === "false" ? false : value;
  }
  return props;
}

/** Literal property sets for every occurrence of one registered component.
 * Parsing is read-only; the restricted-MDX validator remains the authority on
 * whether those literals are allowed for the component. */
export function contentComponentInstances(
  body: string,
  componentName: string,
): Record<string, unknown>[] {
  const tree = parseContentBody(body) as Node;
  const matches: Record<string, unknown>[] = [];

  const visit = (node: Node) => {
    if (
      (node.type === "mdxJsxFlowElement" ||
        node.type === "mdxJsxTextElement") &&
      node.name === componentName
    ) {
      const props = literalProps(node);
      if (props) matches.push(props);
    }
    for (const child of node.children ?? []) visit(child);
  };

  visit(tree);
  return matches;
}

export function sameLiteralProps(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const rightEntries = Object.entries(right).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}
