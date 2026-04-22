import { getAnnotationSurfaceAccentCssColor } from "@carma-mapping/annotations/core";

export const distanceToolVisualDefaults = Object.freeze({
  dashedLine: {
    strokeWidthPx: 1.5,
    dashPattern: "8 8",
    renderInScene: false,
  },
  cornerOverlay: {
    minBoxPx: 20,
    paddingPx: 6,
    targetRadiusPx: 20,
    segments: 20,
    strokeWidthPx: 1.25,
    color: getAnnotationSurfaceAccentCssColor(),
    straightHitTargetPx: 20,
  },
});
