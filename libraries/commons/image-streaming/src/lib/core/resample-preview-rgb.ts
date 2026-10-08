import { PI, type DevicePixels } from "@carma-units";

type SampleWindow = {
  x: DevicePixels;
  y: DevicePixels;
  width: DevicePixels;
  height: DevicePixels;
};
const GAMMA_IN = 0.454545;
const GAMMA_OUT = 2.2;
const UNSHARP_SIGMA = 0.2;
const UNSHARP_THRESHOLD = 0.05;
const linear = Float32Array.from({ length: 256 }, (_, i) =>
  Math.pow(i / 255, 1 / GAMMA_IN)
);
const kernel = (x: number) => {
  if (Math.abs(x) >= 3) return 0;
  if (Math.abs(x) < 1e-8) return 1;
  const p = PI * x;
  return ((Math.sin(p) / p) * Math.sin(p / 3)) / (p / 3);
};
const weights = (
  length: number,
  output: number,
  start: number,
  span: number
) => {
  const scale = Math.max(1, span / output);
  return Array.from({ length: output }, (_, i) => {
    const center = start + ((i + 0.5) * span) / output - 0.5;
    const entries: { index: number; weight: number }[] = [];
    let sum = 0;
    for (
      let j = Math.ceil(center - 3 * scale);
      j <= Math.floor(center + 3 * scale);
      j++
    ) {
      const weight = kernel((j - center) / scale);
      if (!weight) continue;
      entries.push({ index: Math.max(0, Math.min(length - 1, j)), weight });
      sum += weight;
    }
    entries.forEach((entry) => {
      entry.weight /= sum;
    });
    return entries;
  });
};

/** Linear-light Lanczos3/Gamma and the 2024 0x0.2 unsharp settings, with no colour subsampling. */
export const resamplePreviewRgb = (
  pixels: Uint8ClampedArray,
  sourceWidth: DevicePixels,
  sourceHeight: DevicePixels,
  width: DevicePixels,
  height: DevicePixels,
  sample: SampleWindow
): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(width * height * 4);
  if (sample.width < width || sample.height < height) {
    // Beyond native resolution show the actual source pixels instead of smoothing them.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sx = Math.max(
          0,
          Math.min(
            sourceWidth - 1,
            Math.floor(sample.x + ((x + 0.5) * sample.width) / width)
          )
        );
        const sy = Math.max(
          0,
          Math.min(
            sourceHeight - 1,
            Math.floor(sample.y + ((y + 0.5) * sample.height) / height)
          )
        );
        const offset = (y * width + x) * 4,
          source = (sy * sourceWidth + sx) * 4;
        out.set(pixels.subarray(source, source + 4), offset);
      }
    return out;
  }
  const wx = weights(sourceWidth, width, sample.x, sample.width),
    wy = weights(sourceHeight, height, sample.y, sample.height);
  const horizontal = new Float32Array(width * sourceHeight * 3);
  for (let y = 0; y < sourceHeight; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      for (const entry of wx[x]) {
        const source = (y * sourceWidth + entry.index) * 4;
        for (let c = 0; c < 3; c++)
          horizontal[offset + c] += linear[pixels[source + c]] * entry.weight;
      }
    }
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      for (const entry of wy[y]) {
        const source = (entry.index * width + x) * 3;
        for (let c = 0; c < 3; c++)
          rgb[offset + c] += horizontal[source + c] * entry.weight;
      }
    }
  const adjacent = Math.exp(-0.5 / (UNSHARP_SIGMA * UNSHARP_SIGMA));
  const norm = (1 + 2 * adjacent) ** 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 3,
        offset = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let blurred = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const ix = Math.max(0, Math.min(width - 1, x + dx)),
              iy = Math.max(0, Math.min(height - 1, y + dy));
            blurred +=
              (rgb[(iy * width + ix) * 3 + c] *
                (dx === 0 ? 1 : adjacent) *
                (dy === 0 ? 1 : adjacent)) /
              norm;
          }
        const difference = rgb[index + c] - blurred;
        const value =
          rgb[index + c] +
          (Math.abs(difference) > UNSHARP_THRESHOLD ? difference : 0);
        out[offset + c] = Math.round(
          255 * Math.pow(Math.max(0, Math.min(1, value)), 1 / GAMMA_OUT)
        );
      }
      out[offset + 3] = 255;
    }
  return out;
};
