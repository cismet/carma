import {
  COLORS_HEX,
  formatHexRgbaCss,
  resolveDisplayP3WhiteCssColor,
} from "@carma-commons/utils";

const labelOverlayAffordanceRatioDefaults = Object.freeze({
  midpointTickLengthToMarkerDiameter: 0.8,
  midpointTickThicknessToMarkerStrokeWidth: 1.25,
  midpointHitTargetToTickLength: 1.75,
});

export const labelOverlayLayerDefaults = Object.freeze({
  zIndex: Object.freeze({
    line: 5,
    lineLabel: 6,
    pointMarker: 16,
    pointLabel: 20,
    interactionHandleFloor: 24,
  }),
});

export const labelOverlayAffordanceDefaults = Object.freeze({
  colors: Object.freeze({
    surfaceMax: resolveDisplayP3WhiteCssColor(),
    surfaceStrong: resolveDisplayP3WhiteCssColor(0.95),
    hoverRing: resolveDisplayP3WhiteCssColor(0.18),
    shadowSoft: formatHexRgbaCss(COLORS_HEX.NEUTRAL_BLACK, 0.55),
  }),
  shadow: Object.freeze({
    markerBlurRadiusPx: 2,
  }),
  hover: Object.freeze({
    scale: 1.16,
    ringSpreadPx: 4,
    brightness: 1.08,
    saturation: 1.08,
    transitionDurationMs: 120,
  }),
  ratios: labelOverlayAffordanceRatioDefaults,
});

export const buildOverlayRingBoxShadowCss = ({
  color = labelOverlayAffordanceDefaults.colors.hoverRing,
  spreadPx = labelOverlayAffordanceDefaults.hover.ringSpreadPx,
}: {
  color?: string;
  spreadPx?: number;
} = {}): string => (spreadPx > 0 ? `0 0 0 ${spreadPx}px ${color}` : "none");

export const buildOverlayGlowBoxShadowCss = ({
  color,
  blurRadiusPx,
}: {
  color?: string;
  blurRadiusPx: number;
}): string =>
  color !== undefined && blurRadiusPx > 0
    ? `0 0 ${blurRadiusPx}px ${color}`
    : "none";

export const buildOverlaySoftShadowBoxShadowCss = ({
  color = labelOverlayAffordanceDefaults.colors.shadowSoft,
  blurRadiusPx = labelOverlayAffordanceDefaults.shadow.markerBlurRadiusPx,
}: {
  color?: string;
  blurRadiusPx?: number;
} = {}): string =>
  blurRadiusPx > 0 ? `0 0 ${blurRadiusPx}px ${color}` : "none";

export const buildOverlayHoverFilterCss = ({
  brightness = labelOverlayAffordanceDefaults.hover.brightness,
  saturation = labelOverlayAffordanceDefaults.hover.saturation,
}: {
  brightness?: number;
  saturation?: number;
} = {}): string => `brightness(${brightness}) saturate(${saturation})`;

export const buildOverlayHoverTransitionCss = ({
  durationMs = labelOverlayAffordanceDefaults.hover.transitionDurationMs,
}: {
  durationMs?: number;
} = {}): string =>
  [
    `transform ${durationMs}ms ease`,
    `box-shadow ${durationMs}ms ease`,
    `filter ${durationMs}ms ease`,
  ].join(", ");

export const resolveOverlayMidpointTickMetrics = ({
  markerDiameterPx,
  markerStrokeWidthPx,
}: {
  markerDiameterPx: number;
  markerStrokeWidthPx: number;
}) => {
  const tickLengthPx =
    markerDiameterPx *
    labelOverlayAffordanceDefaults.ratios.midpointTickLengthToMarkerDiameter;
  const tickWidthPx =
    markerStrokeWidthPx *
    labelOverlayAffordanceDefaults.ratios
      .midpointTickThicknessToMarkerStrokeWidth;

  return Object.freeze({
    tickLengthPx,
    tickWidthPx,
    hitTargetPx:
      tickLengthPx *
      labelOverlayAffordanceDefaults.ratios.midpointHitTargetToTickLength,
  });
};
