import { color as parseCssColor } from "d3-color";

export const pointQueryControllerDefaults = Object.freeze({
  performance: Object.freeze({
    reportIntervalMs: 250,
    maxRenderRequestRateHz: 0,
  }),
  sampling: Object.freeze({
    trueSampleRefreshIntervalMs: 32,
    trueNormalRefreshIntervalMs: 96,
    maxFastSampleOffsetPx: 6,
    rawPointerFallbackWindowMs: 12,
  }),
});

export const resolveCssColorWithAlpha = (
  colorCss: string,
  opacity: number
): string => {
  const parsedColor = parseCssColor(colorCss) ?? parseCssColor("white");
  if (!parsedColor) {
    return `rgba(255,255,255,${opacity})`;
  }

  const { r, g, b } = parsedColor.rgb();
  return `rgba(${[r, g, b].map(Math.round).join(",")},${opacity})`;
};
