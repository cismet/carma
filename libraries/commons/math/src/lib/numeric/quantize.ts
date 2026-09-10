export const quantize = (value: number, step: number): number => {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("Quantization step must be a positive finite number");
  }
  return Math.round(value / step) * step;
};
