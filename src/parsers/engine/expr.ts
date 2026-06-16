/**
 * A tiny, safe expression language for `compute` steps — arithmetic, comparison
 * and a ternary, over identifiers resolved from the evaluation scope. No
 * function calls, member access, assignment, or loops, so it can run untrusted
 * (user-authored) config without `eval`.
 *
 * Undefined propagation: if any identifier is absent (or non-numeric), the whole
 * expression evaluates to `undefined`. This lets mutually-exclusive dialects
 * coexist — the branch whose inputs are missing simply yields undefined and a
 * downstream `coalesce` picks the one that resolved.
 */

export type ExprResult = number | boolean | undefined;
export type Scope = Record<string, string | number | undefined>;

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const OPS = ["<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "%", "(", ")", "?", ":"];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      tokens.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      tokens.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS.includes(two)) {
      tokens.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (OPS.includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Bad character in expression: "${c}"`);
  }
  return tokens;
}

// ── AST ──────────────────────────────────────────────────────────────────────
type Node =
  | { k: "num"; v: number }
  | { k: "id"; v: string }
  | { k: "unary"; op: string; x: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "ternary"; c: Node; a: Node; b: Node };

/** Recursive-descent parser. Precedence: ternary < comparison < add < mul <
 * unary < primary. */
function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v?: string) => {
    const tok = tokens[pos];
    if (v && (!tok || tok.v !== v)) throw new Error(`Expected "${v}"`);
    pos++;
    return tok;
  };

  function ternary(): Node {
    const c = comparison();
    if (peek()?.t === "op" && peek().v === "?") {
      eat("?");
      const a = ternary();
      eat(":");
      const b = ternary();
      return { k: "ternary", c, a, b };
    }
    return c;
  }

  function comparison(): Node {
    let a = additive();
    while (peek()?.t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().v as string)) {
      const op = eat().v as string;
      a = { k: "bin", op, a, b: additive() };
    }
    return a;
  }

  function additive(): Node {
    let a = multiplicative();
    while (peek()?.t === "op" && ["+", "-"].includes(peek().v as string)) {
      const op = eat().v as string;
      a = { k: "bin", op, a, b: multiplicative() };
    }
    return a;
  }

  function multiplicative(): Node {
    let a = unary();
    while (peek()?.t === "op" && ["*", "/", "%"].includes(peek().v as string)) {
      const op = eat().v as string;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }

  function unary(): Node {
    if (peek()?.t === "op" && peek().v === "-") {
      eat("-");
      return { k: "unary", op: "-", x: unary() };
    }
    return primary();
  }

  function primary(): Node {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num") {
      eat();
      return { k: "num", v: tok.v };
    }
    if (tok.t === "id") {
      eat();
      return { k: "id", v: tok.v };
    }
    if (tok.t === "op" && tok.v === "(") {
      eat("(");
      const e = ternary();
      eat(")");
      return e;
    }
    throw new Error(`Unexpected token "${tok.v}"`);
  }

  const node = ternary();
  if (pos !== tokens.length) throw new Error("Trailing tokens in expression");
  return node;
}

function toNum(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function evalNode(node: Node, scope: Scope): ExprResult {
  switch (node.k) {
    case "num":
      return node.v;
    case "id":
      return toNum(scope[node.v]);
    case "unary": {
      const x = evalNode(node.x, scope);
      return typeof x === "number" ? -x : undefined;
    }
    case "ternary": {
      const c = evalNode(node.c, scope);
      if (c === undefined) return undefined;
      return c ? evalNode(node.a, scope) : evalNode(node.b, scope);
    }
    case "bin": {
      const a = evalNode(node.a, scope);
      const b = evalNode(node.b, scope);
      if (a === undefined || b === undefined) return undefined;
      if (typeof a !== "number" || typeof b !== "number") return undefined;
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "%":
          return a % b;
        case "<":
          return a < b;
        case ">":
          return a > b;
        case "<=":
          return a <= b;
        case ">=":
          return a >= b;
        case "==":
          return a === b;
        case "!=":
          return a !== b;
      }
    }
  }
}

const cache = new Map<string, Node>();

export function evalExpr(src: string, scope: Scope): ExprResult {
  let ast = cache.get(src);
  if (!ast) {
    ast = parse(tokenize(src));
    cache.set(src, ast);
  }
  return evalNode(ast, scope);
}
