/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Vector2 is a CARMA-native 2D math type across camera/view code.
import { Vector2 } from "three";
import { isFiniteNumber } from "./numeric/isFiniteNumber";

export { Vector2 };
export type Vec2 = Vector2;
export type Vec2Json = {
  x: number;
  y: number;
};

export const coerceVec2 = (value: unknown): Vec2 | null => {
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

export const vec2ToJson = (vec2: Vec2): Vec2Json => ({
  x: vec2.x,
  y: vec2.y,
});

export const vec2FromJson = (json: Vec2Json): Vec2 =>
  new Vector2(json.x, json.y);
