/**
 * A style's opacity value times the layer bar's slider value, keeping
 * expressions intact. A zoom expression may only be a top-level step or
 * interpolate, so it cannot be wrapped in ["*", ...]: its outputs are scaled
 * instead. That keeps e.g. a zoom band (["step", ["zoom"], 0, 20, 1, 21, 0])
 * working while the slider is below 100 %.
 */
export const scaleOpacity = (value: unknown, factor: number): unknown => {
  if (factor === 1) return value;
  if (typeof value === "number") return value * factor;
  if (!Array.isArray(value)) {
    // legacy function objects ({ stops }) cannot be scaled; behave as before
    return factor < 1 ? factor : value;
  }
  const [op] = value;
  if (op === "step") {
    // ["step", input, out0, stop1, out1, ...]: outputs at even indexes from 2
    return value.map((v, i) =>
      i >= 2 && i % 2 === 0 ? scaleOpacity(v, factor) : v
    );
  }
  if (op === "interpolate") {
    // ["interpolate", type, input, stop1, out1, ...]: outputs at even indexes from 4
    return value.map((v, i) =>
      i >= 4 && i % 2 === 0 ? scaleOpacity(v, factor) : v
    );
  }
  return ["*", value, factor];
};
