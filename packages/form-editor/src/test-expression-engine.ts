/**
 * Test-only stand-in for `@vef-framework-react/expression`, injected through
 * `vi.mock` so the form-editor specs exercise the linkage runtime without
 * loading the real ZEN WASM engine.
 *
 * `evaluateTestExpression` is a small recursive-descent evaluator for the ZEN
 * subset the linkage specs use: member access on `field` / `$form` / `$vars` /
 * `$user` / `$node`, string / number / boolean literals, the comparison
 * operators (`==` `!=` `>` `<` `>=` `<=`), `+` / `-`, and `and` / `or`. Anything
 * it cannot tokenize or resolve throws, mirroring how a malformed ZEN expression
 * surfaces to the runtime (which then degrades to `false` / `undefined`). It is
 * deliberately general — no expression string is special-cased.
 *
 * This file is test scaffolding, not shipped source, and is excluded from
 * coverage in `vitest.config.ts`.
 */

type Scope = Record<string, unknown>;

const ROOT_KEYS = new Set(["field", "$form", "$vars", "$user", "$node"]);
const COMPARISON_OPERATORS = new Set(["==", "!=", ">", "<", ">=", "<="]);

interface Token {
  type: "number" | "string" | "boolean" | "path" | "operator" | "and" | "or";
  value: string | number | boolean;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source.charAt(index);

    if (char === " " || char === "\t" || char === "\n") {
      index += 1;
      continue;
    }

    if (char === "'" || char === "\"") {
      let cursor = index + 1;
      let value = "";

      while (cursor < source.length && source.charAt(cursor) !== char) {
        value += source.charAt(cursor);
        cursor += 1;
      }

      if (cursor >= source.length) {
        throw new Error("Unterminated string literal");
      }

      tokens.push({ type: "string", value });
      index = cursor + 1;
      continue;
    }

    if (char >= "0" && char <= "9") {
      let cursor = index;
      let raw = "";

      while (cursor < source.length && /[\d.]/.test(source.charAt(cursor))) {
        raw += source.charAt(cursor);
        cursor += 1;
      }

      tokens.push({ type: "number", value: Number(raw) });
      index = cursor;
      continue;
    }

    const pair = source.slice(index, index + 2);

    if (pair === "==" || pair === "!=" || pair === ">=" || pair === "<=") {
      tokens.push({ type: "operator", value: pair });
      index += 2;
      continue;
    }

    if (char === ">" || char === "<" || char === "+" || char === "-") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (/[A-Z_$]/i.test(char)) {
      let cursor = index;
      let raw = "";

      while (cursor < source.length && /[\w$.]/.test(source.charAt(cursor))) {
        raw += source.charAt(cursor);
        cursor += 1;
      }

      index = cursor;

      if (raw === "true" || raw === "false") {
        tokens.push({ type: "boolean", value: raw === "true" });
      } else if (raw === "and" || raw === "or") {
        tokens.push({ type: raw, value: raw });
      } else {
        tokens.push({ type: "path", value: raw });
      }

      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

export function evaluateTestExpression(source: string, scope: Scope = {}): unknown {
  const tokens = tokenize(source);
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const consume = (): Token | undefined => tokens[position++];

  function resolvePath(path: string): unknown {
    const [root = "", ...rest] = path.split(".");

    if (!ROOT_KEYS.has(root)) {
      throw new Error(`Unknown identifier: ${root}`);
    }

    let value: unknown = scope[root];

    for (const key of rest) {
      value = (value as Scope | undefined)?.[key];
    }

    return value;
  }

  function parsePrimary(): unknown {
    const token = consume();

    if (token === undefined) {
      throw new Error("Unexpected end of expression");
    }

    if (token.type === "number" || token.type === "string" || token.type === "boolean") {
      return token.value;
    }

    if (token.type === "path") {
      return resolvePath(token.value as string);
    }

    throw new Error(`Unexpected token: ${String(token.value)}`);
  }

  function parseAdditive(): unknown {
    let left = parsePrimary();

    while (peek()?.type === "operator" && (peek()?.value === "+" || peek()?.value === "-")) {
      const operator = consume()?.value;
      const right = parsePrimary();
      left = operator === "+" ? Number(left) + Number(right) : Number(left) - Number(right);
    }

    return left;
  }

  function parseComparison(): unknown {
    const left = parseAdditive();
    const token = peek();

    if (token?.type !== "operator" || !COMPARISON_OPERATORS.has(token.value as string)) {
      return left;
    }

    consume();
    const right = parseAdditive();

    switch (token.value) {
      case "==": {
        return left === right;
      }

      case "!=": {
        return left !== right;
      }

      case ">": {
        return Number(left) > Number(right);
      }

      case "<": {
        return Number(left) < Number(right);
      }

      case ">=": {
        return Number(left) >= Number(right);
      }

      case "<=": {
        return Number(left) <= Number(right);
      }

      default: {
        throw new Error(`Unsupported operator: ${String(token.value)}`);
      }
    }
  }

  function parseAnd(): unknown {
    let left = parseComparison();

    while (peek()?.type === "and") {
      consume();
      const right = parseComparison();
      left = Boolean(left) && Boolean(right);
    }

    return left;
  }

  function parseOr(): unknown {
    let left = parseAnd();

    while (peek()?.type === "or") {
      consume();
      const right = parseAnd();
      left = Boolean(left) || Boolean(right);
    }

    return left;
  }

  const result = parseOr();

  if (position < tokens.length) {
    throw new Error(`Unexpected trailing token: ${String(peek()?.value)}`);
  }

  return result;
}

export function mockExpressionPackage(): {
  evaluateSync: (source: string, context?: Scope) => unknown;
  getEngineError: () => null;
  isEngineReady: () => boolean;
  loadEngine: () => Promise<unknown>;
} {
  return {
    evaluateSync: vi.fn(evaluateTestExpression),
    getEngineError: vi.fn(() => null),
    isEngineReady: vi.fn(() => true),
    loadEngine: vi.fn(() => Promise.resolve({}))
  };
}
