import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";
import {
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX,
  ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX,
  ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
  buildAnnotationCursorForegroundSvgMarkup,
  buildAnnotationCursorShadowSvgMarkup,
  ResponsiveStatusBar,
  type AnnotationCursorSvgPathDefinition,
} from "@carma-commons/ui/components";
import { typographyDefaults } from "@carma-mapping/annotations/runtime";
import barmenBackgroundUrl from "../providers/label-overlay/assets/barmen-background.png";
import {
  CURSOR_RENDER_MODES,
  type CursorRenderMode,
} from "./cursor-story-shared";

type CursorDesignStoryProps = {
  animateY: boolean;
  durationMs: number;
  startY: number;
  amplitude: number;
  mode: CursorRenderMode;
  showAura: boolean;
  auraOnly: boolean;
  foregroundBlend: CursorForegroundBlendMode;
  foregroundColor: string;
  shadowBlend: CursorShadowBlendMode;
  shadowColor: string;
  shadowStrokeWidthPx: number;
  shadowBlurPx: number;
};

const CURSOR_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "darken",
  "lighten",
  "overlay",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
] as const;

type CursorShadowBlendMode = (typeof CURSOR_BLEND_MODES)[number];
type CursorForegroundBlendMode = (typeof CURSOR_BLEND_MODES)[number];

const CURSOR_SHADOW_BLEND_MODES = CURSOR_BLEND_MODES;
const CURSOR_FOREGROUND_BLEND_MODES = CURSOR_BLEND_MODES;

const clampUnit = (value: number) => Math.min(Math.max(value, 0), 1);
const clampNonNegative = (value: number) => Math.max(value, 0);

type CrosshairShapeMetrics = {
  shapeHalfExtentPx: number;
  shapeSizePx: number;
};

type CrosshairCanvasMetrics = {
  auraPaddingPx: number;
  canvasSizePx: number;
  viewBox: string;
};

const CURSOR_AURA_PADDING_PX = ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX;
const CURSOR_SHADOW_LINEJOIN: "round" | "miter" = "round";

const FIXED_CROSSHAIR_SHAPE_METRICS: CrosshairShapeMetrics = Object.freeze({
  shapeHalfExtentPx: ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX,
  shapeSizePx: Math.max(ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX * 2, 1),
});

const CURSOR_PATH_DEFINITIONS: readonly AnnotationCursorSvgPathDefinition[] =
  ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS;

const resolveCrosshairCanvasMetrics = ({
  shapeHalfExtentPx,
  shadowStrokeWidthPx,
  shadowBlurPx,
  showAura,
}: {
  shapeHalfExtentPx: number;
  shadowStrokeWidthPx: number;
  shadowBlurPx: number;
  showAura: boolean;
}): CrosshairCanvasMetrics => {
  const clampedShadowStrokeWidthPx = clampNonNegative(shadowStrokeWidthPx);
  const clampedShadowBlurPx = clampNonNegative(shadowBlurPx);
  const dynamicAuraPaddingPx = showAura
    ? Math.max(
        CURSOR_AURA_PADDING_PX +
          clampedShadowStrokeWidthPx +
          clampedShadowBlurPx * 4,
        clampedShadowStrokeWidthPx * 1.5 + clampedShadowBlurPx * 4
      )
    : CURSOR_AURA_PADDING_PX;
  const canvasHalfExtentPx = shapeHalfExtentPx + dynamicAuraPaddingPx;
  const canvasSizePx = canvasHalfExtentPx * 2;

  return {
    auraPaddingPx: dynamicAuraPaddingPx,
    canvasSizePx,
    viewBox: `${-canvasHalfExtentPx} ${-canvasHalfExtentPx} ${canvasSizePx} ${canvasSizePx}`,
  };
};

const resolveAnimatedCursorY = ({
  animateY,
  durationMs,
  startY,
  amplitude,
  nowMs,
  phaseOffsetMs = 0,
}: Pick<
  CursorDesignStoryProps,
  "animateY" | "durationMs" | "startY" | "amplitude"
> & {
  nowMs: number;
  phaseOffsetMs?: number;
}) => {
  const baseY = clampUnit(startY);
  const clampedAmplitude = clampUnit(amplitude);

  if (!animateY || clampedAmplitude === 0) {
    return baseY;
  }

  const cycleDurationMs = Math.max(durationMs, 1);
  const cycleProgress =
    ((nowMs + phaseOffsetMs) % cycleDurationMs) / cycleDurationMs;

  return clampUnit(
    baseY + Math.sin(cycleProgress * Math.PI * 2) * clampedAmplitude
  );
};

const useAnimationClockMs = (enabled: boolean) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const animationStartMsRef = useRef<number | null>(null);

  useEffect(() => {
    animationStartMsRef.current = null;

    if (!enabled) {
      setElapsedMs(0);
      return;
    }

    let animationFrameId = 0;

    const tick = (frameNowMs: number) => {
      if (animationStartMsRef.current === null) {
        animationStartMsRef.current = frameNowMs;
        setElapsedMs(0);
      } else {
        setElapsedMs(frameNowMs - animationStartMsRef.current);
      }
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [enabled]);

  return elapsedMs;
};

const CURSOR_SCALE_PRESETS = [
  { label: "50%", scale: 0.5 },
  { label: "100%", scale: 1 },
  { label: "200%", scale: 2 },
  { label: "400%", scale: 4 },
] as const;

const PAGE_STYLE: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #e2e8f0 0%, #f8fafc 22%, #e5e7eb 100%)",
};

const STATUS_BAR_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 0,
  padding: 0,
  boxSizing: "border-box",
};

const CARD_STYLE: CSSProperties = {
  position: "relative",
  minHeight: 420,
  overflow: "hidden",
  padding: 0,
};

const CARD_LABEL_STYLE: CSSProperties = {
  fontFamily: typographyDefaults.fontFamily,
  fontSize: typographyDefaults.supportFontSizePx,
  fontWeight: typographyDefaults.sectionTitleFontWeight,
  lineHeight: 1.35,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(15, 23, 42, 0.78)",
};

const BASE_STAGE_GAP_PX = 18;

const resolveStageStyle = ({
  auraPaddingPx,
}: Pick<CrosshairCanvasMetrics, "auraPaddingPx">): CSSProperties => {
  const additionalAuraPx = Math.max(auraPaddingPx - CURSOR_AURA_PADDING_PX, 0);
  const gapPx = Math.max(BASE_STAGE_GAP_PX - additionalAuraPx * 1.1, 0);

  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    minHeight: 352,
    marginTop: 18,
    gap: `${gapPx}px`,
    padding: "0",
  };
};

const STAGE_BASE_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "stretch",
  minHeight: 352,
  marginTop: 18,
};

const PREVIEW_COLUMN_STYLE = (widthPx: number): CSSProperties => ({
  position: "relative",
  flex: `0 1 ${widthPx}px`,
  width: widthPx,
  minWidth: 0,
  minHeight: 170,
});

const PREVIEW_SURFACE_STYLE: CSSProperties = {
  position: "absolute",
  inset: "0 0 22px 0",
};

const CURSOR_URL_MAX_ASSET_SIZE_PX = 128;
const CURSOR_URL_LAYERS = {
  COMBINED: "combined",
  SHADOW: "shadow",
  FOREGROUND: "foreground",
} as const;

type CursorUrlLayer =
  (typeof CURSOR_URL_LAYERS)[keyof typeof CURSOR_URL_LAYERS];

const resolveCursorUrlPreviewMetrics = ({
  scale,
  shapeMetrics,
  canvasMetrics,
}: {
  scale: number;
  shapeMetrics: CrosshairShapeMetrics;
  canvasMetrics: CrosshairCanvasMetrics;
}) => {
  const shapeSizePx = Math.min(
    Math.max(Math.round(shapeMetrics.shapeSizePx * scale), 1),
    CURSOR_URL_MAX_ASSET_SIZE_PX
  );
  const scaledPaddingPx = Math.max(
    Math.round(
      (canvasMetrics.auraPaddingPx * shapeSizePx) /
        Math.max(shapeMetrics.shapeSizePx, 1)
    ),
    0
  );
  const maxPaddingPx = Math.max(
    Math.floor((CURSOR_URL_MAX_ASSET_SIZE_PX - shapeSizePx) / 2),
    0
  );
  const paddingPx = Math.min(scaledPaddingPx, maxPaddingPx);
  const assetSizePx = shapeSizePx + paddingPx * 2;
  const anchorPx = Math.max(Math.floor(assetSizePx / 2), 0);
  const strokeScale = shapeSizePx / Math.max(shapeMetrics.shapeSizePx, 0.001);
  const viewBoxHalfExtentPx =
    shapeMetrics.shapeHalfExtentPx + paddingPx / Math.max(strokeScale, 0.001);
  const viewBoxSizePx = viewBoxHalfExtentPx * 2;

  return {
    shapeSizePx,
    paddingPx,
    assetSizePx,
    anchorPx,
    viewBox: `${-viewBoxHalfExtentPx} ${-viewBoxHalfExtentPx} ${viewBoxSizePx} ${viewBoxSizePx}`,
  };
};

const encodeSvgDataUrl = (svgMarkup: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

const buildCursorUrlPreviewDataUrl = ({
  scale,
  showAura,
  auraOnly,
  shadowColor,
  shadowStrokeWidthPx,
  shadowBlurPx,
  foregroundColor,
  layer = CURSOR_URL_LAYERS.COMBINED,
  pathDefinitions,
  shapeMetrics,
  canvasMetrics,
}: {
  scale: number;
  showAura: boolean;
  auraOnly: boolean;
  shadowColor: string;
  shadowStrokeWidthPx: number;
  shadowBlurPx: number;
  foregroundColor: string;
  layer?: CursorUrlLayer;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shapeMetrics: CrosshairShapeMetrics;
  canvasMetrics: CrosshairCanvasMetrics;
}) => {
  const metrics = resolveCursorUrlPreviewMetrics({
    scale,
    shapeMetrics,
    canvasMetrics,
  });
  const clampedShadowStrokeWidthPx = Math.max(shadowStrokeWidthPx, 0);
  const clampedShadowBlurPx = Math.max(shadowBlurPx, 0);
  const shadowLinejoin = CURSOR_SHADOW_LINEJOIN;
  const shadowFilterId = "cursor-shadow-blur";

  const shadowFilterMarkup =
    showAura && clampedShadowBlurPx > 0
      ? `<defs><filter id="${shadowFilterId}" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="${clampedShadowBlurPx}" flood-color="${shadowColor}" flood-opacity="1"/></filter></defs>`
      : "";

  const shadowMarkup = showAura
    ? pathDefinitions
        .map(
          ({ pathD }) =>
            `<path d="${pathD}" fill="${shadowColor}"${
              clampedShadowStrokeWidthPx > 0
                ? ` stroke="${shadowColor}" stroke-width="${clampedShadowStrokeWidthPx}" stroke-linejoin="${shadowLinejoin}"`
                : ""
            }${
              clampedShadowBlurPx > 0 ? ` filter="url(#${shadowFilterId})"` : ""
            }/>`
        )
        .join("")
    : "";

  const foregroundMarkup = pathDefinitions
    .map(({ pathD }) => `<path d="${pathD}" fill="${foregroundColor}"/>`)
    .join("");

  const layerMarkup =
    layer === CURSOR_URL_LAYERS.SHADOW
      ? shadowMarkup
      : layer === CURSOR_URL_LAYERS.FOREGROUND
      ? auraOnly
        ? ""
        : foregroundMarkup
      : `${shadowMarkup}${auraOnly ? "" : foregroundMarkup}`;

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.assetSizePx}" height="${metrics.assetSizePx}" viewBox="${metrics.viewBox}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision">`,
    shadowFilterMarkup,
    layerMarkup,
    "</svg>",
  ].join("");

  return encodeSvgDataUrl(svgMarkup);
};

const resolveCursorUrlAssetStyle = ({
  scale,
  y,
  shapeMetrics,
  canvasMetrics,
}: {
  scale: number;
  y: number;
  shapeMetrics: CrosshairShapeMetrics;
  canvasMetrics: CrosshairCanvasMetrics;
}): CSSProperties => {
  const metrics = resolveCursorUrlPreviewMetrics({
    scale,
    shapeMetrics,
    canvasMetrics,
  });
  const laneHeightPx = Math.max(metrics.assetSizePx, 24);

  return {
    position: "absolute",
    left: "50%",
    top: `calc(${y * 100}% - ${laneHeightPx / 2}px)`,
    width: laneHeightPx,
    height: laneHeightPx,
    transform: "translateX(-50%)",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
  };
};

const resolveCursorUrlPreviewCssValue = ({
  scale,
  showAura,
  auraOnly,
  shadowColor,
  shadowStrokeWidthPx,
  shadowBlurPx,
  foregroundColor,
  pathDefinitions,
  shapeMetrics,
  canvasMetrics,
}: {
  scale: number;
  showAura: boolean;
  auraOnly: boolean;
  shadowColor: string;
  shadowStrokeWidthPx: number;
  shadowBlurPx: number;
  foregroundColor: string;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shapeMetrics: CrosshairShapeMetrics;
  canvasMetrics: CrosshairCanvasMetrics;
}) =>
  (() => {
    const metrics = resolveCursorUrlPreviewMetrics({
      scale,
      shapeMetrics,
      canvasMetrics,
    });
    return `url("${buildCursorUrlPreviewDataUrl({
      scale,
      showAura,
      auraOnly,
      shadowColor,
      shadowStrokeWidthPx,
      shadowBlurPx,
      foregroundColor,
      pathDefinitions,
      shapeMetrics,
      canvasMetrics,
      layer: CURSOR_URL_LAYERS.COMBINED,
    })}") ${metrics.anchorPx} ${metrics.anchorPx}, crosshair`;
  })();

const resolveCursorUrlPreviewAssetSrc = ({
  scale,
  showAura,
  auraOnly,
  shadowColor,
  shadowStrokeWidthPx,
  shadowBlurPx,
  foregroundColor,
  layer = CURSOR_URL_LAYERS.COMBINED,
  pathDefinitions,
  shapeMetrics,
  canvasMetrics,
}: {
  scale: number;
  showAura: boolean;
  auraOnly: boolean;
  shadowColor: string;
  shadowStrokeWidthPx: number;
  shadowBlurPx: number;
  foregroundColor: string;
  layer?: CursorUrlLayer;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shapeMetrics: CrosshairShapeMetrics;
  canvasMetrics: CrosshairCanvasMetrics;
}) =>
  buildCursorUrlPreviewDataUrl({
    scale,
    showAura,
    auraOnly,
    shadowColor,
    shadowStrokeWidthPx,
    shadowBlurPx,
    foregroundColor,
    layer,
    pathDefinitions,
    shapeMetrics,
    canvasMetrics,
  });

const resolveCursorShadowLayerStyle = ({
  canvasMetrics,
}: {
  canvasMetrics: CrosshairCanvasMetrics;
}): CSSProperties => ({
  position: "absolute",
  inset: 0,
  width: canvasMetrics.canvasSizePx,
  height: canvasMetrics.canvasSizePx,
  pointerEvents: "none",
  mixBlendMode: "normal",
});

const resolveCursorForegroundLayerStyle = ({
  canvasMetrics,
}: {
  canvasMetrics: CrosshairCanvasMetrics;
}): CSSProperties => ({
  position: "absolute",
  inset: 0,
  width: canvasMetrics.canvasSizePx,
  height: canvasMetrics.canvasSizePx,
  pointerEvents: "none",
  mixBlendMode: "normal",
});

let noiseGrainTextureUrlCache: string | undefined;

const convertHslToRgb = ({
  hue,
  saturation,
  lightness,
}: {
  hue: number;
  saturation: number;
  lightness: number;
}) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const secondComponent = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = lightness - chroma / 2;

  if (huePrime < 1) {
    return {
      red: Math.round((chroma + match) * 255),
      green: Math.round((secondComponent + match) * 255),
      blue: Math.round(match * 255),
    };
  }

  if (huePrime < 2) {
    return {
      red: Math.round((secondComponent + match) * 255),
      green: Math.round((chroma + match) * 255),
      blue: Math.round(match * 255),
    };
  }

  if (huePrime < 3) {
    return {
      red: Math.round(match * 255),
      green: Math.round((chroma + match) * 255),
      blue: Math.round((secondComponent + match) * 255),
    };
  }

  if (huePrime < 4) {
    return {
      red: Math.round(match * 255),
      green: Math.round((secondComponent + match) * 255),
      blue: Math.round((chroma + match) * 255),
    };
  }

  if (huePrime < 5) {
    return {
      red: Math.round((secondComponent + match) * 255),
      green: Math.round(match * 255),
      blue: Math.round((chroma + match) * 255),
    };
  }

  return {
    red: Math.round((chroma + match) * 255),
    green: Math.round(match * 255),
    blue: Math.round((secondComponent + match) * 255),
  };
};

const resolveNoiseGrainTextureUrl = () => {
  if (typeof noiseGrainTextureUrlCache === "string") {
    return noiseGrainTextureUrlCache;
  }

  if (typeof document === "undefined") {
    return "";
  }

  const sizePx = 512;
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;

  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const imageData = context.createImageData(sizePx, sizePx);

  for (let pixelY = 0; pixelY < sizePx; pixelY += 1) {
    for (let pixelX = 0; pixelX < sizePx; pixelX += 1) {
      const pixelIndex = (pixelY * sizePx + pixelX) * 4;
      const saturation = pixelY / (sizePx - 1);

      const { red, green, blue } = convertHslToRgb({
        hue: Math.random() * 360,
        saturation,
        lightness: Math.random(),
      });

      imageData.data[pixelIndex] = red;
      imageData.data[pixelIndex + 1] = green;
      imageData.data[pixelIndex + 2] = blue;
      imageData.data[pixelIndex + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  noiseGrainTextureUrlCache = `url("${canvas.toDataURL("image/png")}")`;
  return noiseGrainTextureUrlCache;
};

const SCALE_LABEL_STYLE: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 0,
  transform: "translateX(-50%)",
  fontFamily: typographyDefaults.fontFamily,
  fontSize: typographyDefaults.supportFontSizePx,
  fontWeight: typographyDefaults.sectionTitleFontWeight,
  lineHeight: 1.35,
  letterSpacing: "0.03em",
  color: "rgba(15, 23, 42, 0.78)",
  whiteSpace: "nowrap",
};

const CURSOR_PREVIEW_POSITION_STYLE = ({
  scaledSizePx,
  y,
}: {
  scaledSizePx: number;
  y: number;
}): CSSProperties => ({
  position: "absolute",
  left: `calc(50% - ${scaledSizePx / 2}px)`,
  top: `calc(${y * 100}% - ${scaledSizePx / 2}px)`,
  width: scaledSizePx,
  height: scaledSizePx,
  pointerEvents: "none",
});

const CURSOR_PREVIEW_GEOMETRY_STYLE = ({
  scaledSizePx,
}: {
  scaledSizePx: number;
}): CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  width: scaledSizePx,
  height: scaledSizePx,
  display: "block",
  pointerEvents: "none",
});

const createCardBackgrounds = (): Array<{
  id: string;
  label: string;
  style: CSSProperties;
}> => {
  const noiseGrainTextureUrl = resolveNoiseGrainTextureUrl();

  return [
    {
      id: "grayscale-ramp",
      label: "Greyscale Ramp",
      style: {
        background:
          "linear-gradient(180deg, #ffffff 0%, #e2e8f0 28%, #94a3b8 55%, #334155 82%, #020617 100%)",
      },
    },
    {
      id: "half-checkerboard",
      label: "Half Checkerboard",
      style: {
        backgroundImage: [
          "linear-gradient(180deg, rgba(148,163,184,0.22) 0%, rgba(203,213,225,0.18) 28%, rgba(248,250,252,0.14) 58%, rgba(255,255,255,0.22) 100%)",
          "linear-gradient(45deg, rgba(15,23,42,0.16) 25%, transparent 25%, transparent 75%, rgba(15,23,42,0.16) 75%)",
          "linear-gradient(45deg, rgba(15,23,42,0.16) 25%, transparent 25%, transparent 75%, rgba(15,23,42,0.16) 75%)",
          "linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)",
        ].join(","),
        backgroundSize: "100% 100%, 24px 24px, 24px 24px, 100% 100%",
        backgroundPosition: "0 0, 0 0, 12px 12px, 0 0",
      },
    },
    {
      id: "urban-image",
      label: "Urban Image",
      style: {
        backgroundImage: `linear-gradient(180deg, rgba(241, 245, 249, 0.16), rgba(248, 250, 252, 0.08)), url(${barmenBackgroundUrl})`,
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      },
    },
    {
      id: "dot-noise-paper",
      label: "Noise Grain",
      style: {
        backgroundImage: [
          noiseGrainTextureUrl || "none",
          "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
        ].join(","),
        backgroundSize: "100% 100%, 100% 100%",
        backgroundPosition: "0 0, 0 0",
        backgroundRepeat: "no-repeat, no-repeat",
        backgroundBlendMode: "normal, normal",
      },
    },
  ];
};

const CursorPreviewOverlay = ({
  scale,
  y,
  pathDefinitions,
  canvasMetrics,
  showAura,
  auraOnly,
  shadowBlend,
  shadowColor,
  shadowStrokeWidthPx,
  foregroundBlend,
  foregroundColor,
  shadowBlurPx,
}: {
  scale: number;
  y: number;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  canvasMetrics: CrosshairCanvasMetrics;
  showAura: boolean;
  auraOnly: boolean;
  shadowBlend: CursorShadowBlendMode;
  shadowColor: string;
  shadowStrokeWidthPx: number;
  foregroundBlend: CursorForegroundBlendMode;
  foregroundColor: string;
  shadowBlurPx: number;
}) => {
  const scaledSizePx = canvasMetrics.canvasSizePx * scale;
  const shadowMarkup = buildAnnotationCursorShadowSvgMarkup({
    pathDefinitions,
    rootStyleText: `display:block;overflow:visible;mix-blend-mode:${shadowBlend};`,
    shadowBlurPx,
    shadowStrokeColor: shadowColor,
    shadowStrokeLinejoin: CURSOR_SHADOW_LINEJOIN,
    shadowStrokeWidth: Math.max(shadowStrokeWidthPx, 0),
    sizePx: scaledSizePx,
    viewBox: canvasMetrics.viewBox,
  });
  const foregroundMarkup = buildAnnotationCursorForegroundSvgMarkup({
    pathDefinitions,
    foregroundFill: foregroundColor,
    rootStyleText: `display:block;overflow:visible;mix-blend-mode:${foregroundBlend};`,
    sizePx: scaledSizePx,
    viewBox: canvasMetrics.viewBox,
  });

  return (
    <div
      aria-hidden="true"
      style={CURSOR_PREVIEW_POSITION_STYLE({ scaledSizePx, y })}
    >
      {showAura ? (
        <div
          aria-hidden="true"
          style={{
            ...CURSOR_PREVIEW_GEOMETRY_STYLE({ scaledSizePx }),
            ...resolveCursorShadowLayerStyle({
              canvasMetrics,
            }),
          }}
          dangerouslySetInnerHTML={{ __html: shadowMarkup }}
        />
      ) : null}
      {!auraOnly ? (
        <div
          aria-hidden="true"
          style={{
            ...CURSOR_PREVIEW_GEOMETRY_STYLE({ scaledSizePx }),
            ...resolveCursorForegroundLayerStyle({
              canvasMetrics,
            }),
          }}
          dangerouslySetInnerHTML={{ __html: foregroundMarkup }}
        />
      ) : null}
    </div>
  );
};

const CursorDesignSandbox = ({
  animateY,
  durationMs,
  startY,
  amplitude,
  mode,
  showAura,
  auraOnly,
  foregroundBlend,
  foregroundColor,
  shadowBlend,
  shadowColor,
  shadowStrokeWidthPx,
  shadowBlurPx,
}: CursorDesignStoryProps) => {
  const backgrounds = useMemo(() => createCardBackgrounds(), []);
  const previews = useMemo(() => CURSOR_SCALE_PRESETS, []);
  const clockMs = useAnimationClockMs(animateY);
  const shapeMetrics = FIXED_CROSSHAIR_SHAPE_METRICS;
  const pathDefinitions = CURSOR_PATH_DEFINITIONS;
  const canvasMetrics = useMemo(
    () =>
      resolveCrosshairCanvasMetrics({
        shapeHalfExtentPx: shapeMetrics.shapeHalfExtentPx,
        shadowStrokeWidthPx,
        shadowBlurPx,
        showAura,
      }),
    [
      shapeMetrics.shapeHalfExtentPx,
      shadowStrokeWidthPx,
      shadowBlurPx,
      showAura,
    ]
  );

  return (
    <div style={PAGE_STYLE}>
      <div style={STATUS_BAR_STYLE}>
        <ResponsiveStatusBar
          label="cursor design"
          values={[
            "annotation playground cursor",
            mode,
            animateY ? "vertical drift on" : "vertical drift off",
            `startY ${clampUnit(startY).toFixed(2)}`,
            `amplitude ${clampUnit(amplitude).toFixed(2)}`,
            showAura ? "aura on" : "aura off",
            auraOnly ? "aura only" : "aura + fg",
            "fixed geometry",
            `aura ${shadowStrokeWidthPx.toFixed(1)} px`,
            `radius ${shadowBlurPx.toFixed(1)} px`,
            `shadow ${shadowBlend}`,
            `shadowColor ${shadowColor}`,
            `fg ${foregroundBlend}`,
            `fgColor ${foregroundColor}`,
            `${durationMs} ms`,
            "4 backdrops",
          ]}
          tone="dark"
        />
      </div>
      <div style={GRID_STYLE}>
        {backgrounds.map((background) => (
          <section
            key={background.id}
            style={{
              ...CARD_STYLE,
              ...background.style,
            }}
          >
            <div style={CARD_LABEL_STYLE}>{background.label}</div>
            <div
              style={{
                ...STAGE_BASE_STYLE,
                ...resolveStageStyle({
                  auraPaddingPx: canvasMetrics.auraPaddingPx,
                }),
              }}
            >
              {previews.map((preview, previewIndex) => {
                const previewY = resolveAnimatedCursorY({
                  animateY,
                  durationMs,
                  startY,
                  amplitude,
                  nowMs: clockMs,
                  phaseOffsetMs: previewIndex * 180,
                });

                return (
                  <div
                    key={preview.label}
                    style={{
                      ...PREVIEW_COLUMN_STYLE(
                        canvasMetrics.canvasSizePx * preview.scale
                      ),
                      cursor: "none",
                    }}
                  >
                    <div
                      style={{
                        ...PREVIEW_SURFACE_STYLE,
                      }}
                    >
                      {mode === CURSOR_RENDER_MODES.CURSOR_URL ? (
                        <>
                          {showAura ? (
                            <img
                              alt=""
                              aria-hidden="true"
                              draggable={false}
                              src={resolveCursorUrlPreviewAssetSrc({
                                scale: preview.scale,
                                shapeMetrics,
                                canvasMetrics,
                                showAura,
                                auraOnly,
                                shadowColor,
                                shadowStrokeWidthPx,
                                shadowBlurPx,
                                foregroundColor,
                                layer: CURSOR_URL_LAYERS.SHADOW,
                                pathDefinitions,
                              })}
                              style={{
                                ...resolveCursorUrlAssetStyle({
                                  scale: preview.scale,
                                  y: previewY,
                                  shapeMetrics,
                                  canvasMetrics,
                                }),
                                mixBlendMode: shadowBlend,
                              }}
                            />
                          ) : null}
                          {!auraOnly ? (
                            <img
                              alt=""
                              aria-hidden="true"
                              draggable={false}
                              src={resolveCursorUrlPreviewAssetSrc({
                                scale: preview.scale,
                                shapeMetrics,
                                canvasMetrics,
                                showAura,
                                auraOnly,
                                shadowColor,
                                shadowStrokeWidthPx,
                                shadowBlurPx,
                                foregroundColor,
                                layer: CURSOR_URL_LAYERS.FOREGROUND,
                                pathDefinitions,
                              })}
                              style={{
                                ...resolveCursorUrlAssetStyle({
                                  scale: preview.scale,
                                  y: previewY,
                                  shapeMetrics,
                                  canvasMetrics,
                                }),
                                mixBlendMode: foregroundBlend,
                              }}
                            />
                          ) : null}
                          {!auraOnly ? (
                            <div
                              aria-hidden="true"
                              style={{
                                ...PREVIEW_SURFACE_STYLE,
                                cursor: resolveCursorUrlPreviewCssValue({
                                  scale: preview.scale,
                                  shapeMetrics,
                                  canvasMetrics,
                                  showAura,
                                  auraOnly,
                                  shadowColor,
                                  shadowStrokeWidthPx,
                                  shadowBlurPx,
                                  foregroundColor,
                                  pathDefinitions,
                                }),
                              }}
                            />
                          ) : null}
                        </>
                      ) : null}
                      {mode === CURSOR_RENDER_MODES.DOM ? (
                        <CursorPreviewOverlay
                          scale={preview.scale}
                          y={previewY}
                          pathDefinitions={pathDefinitions}
                          canvasMetrics={canvasMetrics}
                          showAura={showAura}
                          auraOnly={auraOnly}
                          shadowBlend={shadowBlend}
                          shadowColor={shadowColor}
                          shadowStrokeWidthPx={shadowStrokeWidthPx}
                          foregroundBlend={foregroundBlend}
                          foregroundColor={foregroundColor}
                          shadowBlurPx={shadowBlurPx}
                        />
                      ) : null}
                      {mode === CURSOR_RENDER_MODES.CURSOR_URL ? (
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: `calc(${previewY * 100}% + ${
                              resolveCursorUrlPreviewMetrics({
                                scale: preview.scale,
                                shapeMetrics,
                                canvasMetrics,
                              }).assetSizePx /
                                2 +
                              8
                            }px)`,
                            transform: "translateX(-50%)",
                            fontFamily: typographyDefaults.fontFamily,
                            fontSize:
                              typographyDefaults.supportFontSizePx,
                            fontWeight:
                              typographyDefaults.sectionTitleFontWeight,
                            lineHeight: 1.35,
                            letterSpacing: "0.03em",
                            color: "rgba(15, 23, 42, 0.68)",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                          }}
                        >
                          cursor-url asset
                        </div>
                      ) : null}
                      <div style={SCALE_LABEL_STYLE}>{preview.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

const meta: Meta<CursorDesignStoryProps> = {
  title: "Annotations/Cursor Design",
  component: CursorDesignSandbox,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    animateY: {
      control: { type: "boolean" },
      table: { category: "Motion" },
    },
    durationMs: {
      control: { type: "range", min: 800, max: 12000, step: 100 },
      table: { category: "Motion" },
    },
    startY: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      table: { category: "Motion" },
    },
    amplitude: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      table: { category: "Motion" },
    },
    mode: {
      name: "crosshair",
      control: { type: "inline-radio" },
      options: [CURSOR_RENDER_MODES.DOM, CURSOR_RENDER_MODES.CURSOR_URL],
      table: { category: "Crosshair" },
    },
    showAura: {
      name: "on",
      control: { type: "boolean" },
      table: { category: "Aura" },
    },
    auraOnly: {
      name: "only",
      control: { type: "boolean" },
      table: { category: "Aura" },
    },
    foregroundBlend: {
      name: "blend",
      control: { type: "select" },
      options: CURSOR_FOREGROUND_BLEND_MODES,
      table: { category: "Crosshair-Shape" },
    },
    foregroundColor: {
      name: "color",
      control: { type: "color" },
      table: { category: "Crosshair-Shape" },
    },
    shadowBlend: {
      name: "blend",
      control: { type: "select" },
      options: CURSOR_SHADOW_BLEND_MODES,
      table: { category: "Aura" },
    },
    shadowColor: {
      name: "color",
      control: { type: "color" },
      table: { category: "Aura" },
    },
    shadowStrokeWidthPx: {
      name: "stroke",
      control: { type: "range", min: 0, max: 8, step: 0.1 },
      table: { category: "Aura" },
    },
    shadowBlurPx: {
      name: "radius",
      control: { type: "range", min: 0, max: 6, step: 0.1 },
      table: { category: "Aura" },
    },
  },
};

export default meta;

export const CursorDesign: StoryObj<CursorDesignStoryProps> = {
  args: {
    animateY: false,
    durationMs: 10000,
    startY: 0.5,
    amplitude: 0.4,
    mode: CURSOR_RENDER_MODES.DOM,
    showAura: true,
    auraOnly: false,
    foregroundBlend: "normal",
    foregroundColor: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
    shadowBlend: "darken",
    shadowColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
    shadowStrokeWidthPx: Math.max(ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX, 0) * 2,
    shadowBlurPx: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
  },
};
