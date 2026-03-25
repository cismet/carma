/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Vector2 is a CARMA-native 2D math type across camera/view code.
import { Vector2 } from "three";
import { isFiniteNumber } from "./numeric/isFiniteNumber";

export { Vector2 };
export type Vector2Json = {
  x: number;
  y: number;
};

export const coerceVector2 = (value: unknown): Vector2 | null => {
  if (value instanceof Vector2) {
    return value.clone();
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { x?: unknown; y?: unknown };
  if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) {
    return null;
  }

  return new Vector2(candidate.x, candidate.y);
};

export const vector2ToJson = (vector2: Vector2): Vector2Json => ({
  x: vector2.x,
  y: vector2.y,
});

export const vector2FromJson = (json: Vector2Json): Vector2 =>
  new Vector2(json.x, json.y);
