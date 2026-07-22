import type { CopcPointChunk } from "./copcLoader";

// ─────────────────────────────────────────────────────────────
//  Ad-hoc derived point fields from expressions (QGIS-style).
//  Expressions reference field names plus R/G/B (0..1 from the
//  RGB attribute) and a Math-function whitelist. Compiled via
//  generated Function over a validated token stream — no access
//  to anything outside the provided values.
// ─────────────────────────────────────────────────────────────

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  log: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sin: Math.sin,
  cos: Math.cos,
  atan2: Math.atan2,
  clamp: (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), high),
};

const TOKEN_PATTERN =
  /[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?|[-+*/%(),<>=?:!&|]|\s+/y;

export interface CompiledExpression {
  /** Field names the expression reads (must exist per chunk) */
  fields: string[];
  usesRgb: boolean;
  evaluate: (chunk: CopcPointChunk) => Float32Array;
}

/**
 * Compile an expression over point fields. Throws with a readable
 * message on unknown identifiers or invalid syntax.
 */
export function compileFieldExpression(
  expression: string,
  availableFields: string[]
): CompiledExpression {
  const fieldSet = new Set(availableFields);
  const usedFields = new Set<string>();
  let usesRgb = false;

  // Tokenize + validate: only whitelisted identifiers survive
  let cursor = 0;
  const parts: string[] = [];
  while (cursor < expression.length) {
    TOKEN_PATTERN.lastIndex = cursor;
    const match = TOKEN_PATTERN.exec(expression);
    if (!match) {
      throw new Error(
        `Ungültiges Zeichen an Position ${cursor}: "${expression[cursor]}"`
      );
    }
    const token = match[0];
    cursor = TOKEN_PATTERN.lastIndex;
    if (/^\s+$/.test(token)) continue;
    if (/^[A-Za-z_]/.test(token)) {
      if (token in FUNCTIONS) {
        parts.push(`FN.${token}`);
      } else if (token === "R" || token === "G" || token === "B") {
        usesRgb = true;
        parts.push(`${token}[i]`);
      } else if (fieldSet.has(token)) {
        usedFields.add(token);
        parts.push(`F["${token}"][i]`);
      } else {
        throw new Error(`Unbekanntes Feld/Funktion: "${token}"`);
      }
    } else {
      parts.push(token);
    }
  }
  if (parts.length === 0) throw new Error("Leerer Ausdruck");

  const body = `
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = ${parts.join(" ")};
    }
    return out;
  `;
  // eslint-disable-next-line no-new-func
  const compiled = new Function("F", "R", "G", "B", "n", "FN", body) as (
    fields: Record<string, Float32Array>,
    r: Float32Array,
    g: Float32Array,
    b: Float32Array,
    n: number,
    functions: typeof FUNCTIONS
  ) => Float32Array;

  return {
    fields: [...usedFields],
    usesRgb,
    evaluate: (chunk) => {
      const count = chunk.pointCount;
      let r: Float32Array, g: Float32Array, b: Float32Array;
      if (usesRgb) {
        if (!chunk.colors) {
          throw new Error("Die Punktwolke enthält keine RGB-Daten");
        }
        r = new Float32Array(count);
        g = new Float32Array(count);
        b = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          r[i] = chunk.colors[i * 3] / 255;
          g[i] = chunk.colors[i * 3 + 1] / 255;
          b[i] = chunk.colors[i * 3 + 2] / 255;
        }
      } else {
        r = g = b = new Float32Array(0);
      }
      return compiled(chunk.fieldValues, r, g, b, count, FUNCTIONS);
    },
  };
}

/** Context shorthands offered in the expression UI */
export const EXPRESSION_SHORTHANDS: { label: string; expression: string }[] = [
  { label: "Luminanz", expression: "0.2126*R + 0.7152*G + 0.0722*B" },
  { label: "Intensität×Lum.", expression: "intensity * (R + G + B) / 3" },
  { label: "Tiefe (−z)", expression: "-z" },
  { label: "Höhe²", expression: "pow(z, 2.0)" },
  { label: "Klasse≥Boden", expression: "classification >= 2 ? 1 : 0" },
];
