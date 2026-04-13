/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Vector2 is a CARMA-native 2D math type across camera/view code.
import { Vector2 } from "three";
import { isFiniteNumber } from "./numeric/is-finite-number";

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
