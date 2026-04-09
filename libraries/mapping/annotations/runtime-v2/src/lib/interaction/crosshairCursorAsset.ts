import {
  ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX,
  ANNOTATION_CURSOR_OVERLAY_CENTER_PX,
  ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX,
  ANNOTATION_CURSOR_OVERLAY_INNER_TIP_PX,
  ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  ANNOTATION_CURSOR_OVERLAY_SIZE_PX,
  ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
  ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX,
  type AnnotationCursorOverlayStrokeCapMode,
} from "@carma-commons/ui/components";

import { renderSimpleHairlineCrosshairCursorCanvas } from "./renderSimpleHairlineCrosshairCursorCanvas";

export const CROSSHAIR_CURSOR_SIZE_PX = 48;
export const CROSSHAIR_CURSOR_ANCHOR_PX = 24;
export const SIMPLE_HAIRLINE_CURSOR_SIZE_SERIES_PX = [
  16, 24, 32, 48, 64,
] as const;

export const CROSSHAIR_CURSOR_STYLES = {
  ANNOTATION_PLAYGROUND: "annotation-playground",
  DEBUG_HAIRLINE: "debug-hairline",
} as const;

export type CrosshairCursorStyle =
  (typeof CROSSHAIR_CURSOR_STYLES)[keyof typeof CROSSHAIR_CURSOR_STYLES];

export type CrosshairCursorRenderOptions = {
  style?: CrosshairCursorStyle;
  devicePixelRatio?: number;
  sizePx?: number;
  strokeCap?: AnnotationCursorOverlayStrokeCapMode;
};

export type CrosshairCursorCssValueOptions = CrosshairCursorRenderOptions;

const crosshairCursorCssValueByKey = new Map<string, string>();
const crosshairCursorDataUrlByKey = new Map<string, string>();

const resolveCrosshairCursorStyleOptions = (style?: CrosshairCursorStyle) => {
  const effectiveStyle = style ?? CROSSHAIR_CURSOR_STYLES.ANNOTATION_PLAYGROUND;
  switch (style) {
    case CROSSHAIR_CURSOR_STYLES.DEBUG_HAIRLINE:
      return {
        style: effectiveStyle,
        primaryColor: "rgba(255,255,255,0.98)",
        secondaryColor: "rgba(0,0,0,0.98)",
      };
    case CROSSHAIR_CURSOR_STYLES.ANNOTATION_PLAYGROUND:
    default:
      return {
        style: CROSSHAIR_CURSOR_STYLES.ANNOTATION_PLAYGROUND,
        primaryColor: "hsla(0,0%,100%,0.98)",
        secondaryColor: "rgba(0,0,0,0.98)",
      };
  }
};

type CrosshairCursorResolvedStyleOptions = ReturnType<
  typeof resolveCrosshairCursorStyleOptions
>;

export type CrosshairCursorRasterMetrics = {
  sizePx: number;
  anchorPx: number;
};

const resolveNormalizedDevicePixelRatio = (devicePixelRatio?: number) => {
  if (
    typeof devicePixelRatio === "number" &&
    Number.isFinite(devicePixelRatio)
  ) {
    return Math.max(devicePixelRatio, 1);
  }

  if (
    typeof window !== "undefined" &&
    Number.isFinite(window.devicePixelRatio)
  ) {
    return Math.max(window.devicePixelRatio, 1);
  }

  return 1;
};

const resolveSimpleHairlineCursorSizePx = (devicePixelRatio?: number) => {
  const normalizedDevicePixelRatio =
    resolveNormalizedDevicePixelRatio(devicePixelRatio);
  const targetSizePx = 24 * normalizedDevicePixelRatio;

  return SIMPLE_HAIRLINE_CURSOR_SIZE_SERIES_PX.reduce(
    (bestSizePx, candidateSizePx) => {
      if (
        Math.abs(candidateSizePx - targetSizePx) <
        Math.abs(bestSizePx - targetSizePx)
      ) {
        return candidateSizePx;
      }

      return bestSizePx;
    },
    SIMPLE_HAIRLINE_CURSOR_SIZE_SERIES_PX[0]
  );
};

export const resolveCrosshairCursorRasterMetrics = ({
  style,
  devicePixelRatio,
  sizePx,
}: Pick<
  CrosshairCursorRenderOptions,
  "style" | "devicePixelRatio" | "sizePx"
> = {}): CrosshairCursorRasterMetrics => {
  if (typeof sizePx === "number" && Number.isFinite(sizePx)) {
    const resolvedSizePx = Math.max(Math.round(sizePx), 1);
    return {
      sizePx: resolvedSizePx,
      anchorPx:
        style === CROSSHAIR_CURSOR_STYLES.DEBUG_HAIRLINE
          ? Math.max(Math.floor(resolvedSizePx / 2) - 1, 0)
          : Math.max(Math.floor(resolvedSizePx / 2), 0),
    };
  }

  if (style === CROSSHAIR_CURSOR_STYLES.DEBUG_HAIRLINE) {
    const sizePx = resolveSimpleHairlineCursorSizePx(devicePixelRatio);
    return {
      sizePx,
      anchorPx: Math.max(Math.floor(sizePx / 2) - 1, 0),
    };
  }

  return {
    sizePx: CROSSHAIR_CURSOR_SIZE_PX,
    anchorPx: CROSSHAIR_CURSOR_ANCHOR_PX,
  };
};

const createCursorCanvas = (sizePx: number) => {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  return canvas;
};

const encodeSvgDataUrl = (svgMarkup: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

const createSvgPolygonMarkup = ({
  points,
  fill,
}: {
  points: Array<readonly [number, number]>;
  fill: string;
}) =>
  `<polygon points="${points
    .map(([x, y]) => `${x},${y}`)
    .join(" ")}" fill="${fill}"/>`;

const buildAnnotationPlaygroundCursorSvgMarkup = ({
  metrics,
  strokeCap = "round",
}: {
  metrics: CrosshairCursorRasterMetrics;
  strokeCap?: AnnotationCursorOverlayStrokeCapMode;
}) => {
  const shadowStrokeThicknessPx =
    ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX +
    ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX * 2;
  const shadowDashLengthPx =
    ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX +
    ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX * 2;
  const halfForegroundThicknessPx = ANNOTATION_CURSOR_OVERLAY_THICKNESS_PX / 2;
  const centerPx = ANNOTATION_CURSOR_OVERLAY_CENTER_PX;
  const innerTipPx = ANNOTATION_CURSOR_OVERLAY_INNER_TIP_PX;
  const gapPx = ANNOTATION_CURSOR_OVERLAY_CENTER_GAP_PX;
  const dashLengthPx = ANNOTATION_CURSOR_OVERLAY_FAR_DASH_LENGTH_PX;
  const outlinePx = ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX;
  const shadowInnerTipPx = innerTipPx + outlinePx;
  void strokeCap;

  const shadowPartsMarkup = [
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
      points: [
        [centerPx + gapPx - outlinePx, centerPx],
        [
          centerPx + gapPx - outlinePx + shadowInnerTipPx,
          centerPx - shadowStrokeThicknessPx / 2,
        ],
        [
          centerPx + gapPx - outlinePx + shadowDashLengthPx,
          centerPx - shadowStrokeThicknessPx / 2,
        ],
        [
          centerPx + gapPx - outlinePx + shadowDashLengthPx,
          centerPx + shadowStrokeThicknessPx / 2,
        ],
        [
          centerPx + gapPx - outlinePx + shadowInnerTipPx,
          centerPx + shadowStrokeThicknessPx / 2,
        ],
      ],
    }),
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
      points: [
        [
          centerPx - gapPx - dashLengthPx - outlinePx,
          centerPx - shadowStrokeThicknessPx / 2,
        ],
        [
          centerPx -
            gapPx -
            dashLengthPx -
            outlinePx +
            (shadowDashLengthPx - shadowInnerTipPx),
          centerPx - shadowStrokeThicknessPx / 2,
        ],
        [centerPx - gapPx + outlinePx, centerPx],
        [
          centerPx -
            gapPx -
            dashLengthPx -
            outlinePx +
            (shadowDashLengthPx - shadowInnerTipPx),
          centerPx + shadowStrokeThicknessPx / 2,
        ],
        [
          centerPx - gapPx - dashLengthPx - outlinePx,
          centerPx + shadowStrokeThicknessPx / 2,
        ],
      ],
    }),
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
      points: [
        [
          centerPx - shadowStrokeThicknessPx / 2,
          centerPx + gapPx - outlinePx + shadowInnerTipPx,
        ],
        [centerPx, centerPx + gapPx - outlinePx],
        [
          centerPx + shadowStrokeThicknessPx / 2,
          centerPx + gapPx - outlinePx + shadowInnerTipPx,
        ],
        [
          centerPx + shadowStrokeThicknessPx / 2,
          centerPx + gapPx - outlinePx + shadowDashLengthPx,
        ],
        [
          centerPx - shadowStrokeThicknessPx / 2,
          centerPx + gapPx - outlinePx + shadowDashLengthPx,
        ],
      ],
    }),
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
      points: [
        [
          centerPx - shadowStrokeThicknessPx / 2,
          centerPx - gapPx - dashLengthPx - outlinePx,
        ],
        [
          centerPx + shadowStrokeThicknessPx / 2,
          centerPx - gapPx - dashLengthPx - outlinePx,
        ],
        [
          centerPx + shadowStrokeThicknessPx / 2,
          centerPx -
            gapPx -
            dashLengthPx -
            outlinePx +
            (shadowDashLengthPx - shadowInnerTipPx),
        ],
        [centerPx, centerPx - gapPx + outlinePx],
        [
          centerPx - shadowStrokeThicknessPx / 2,
          centerPx -
            gapPx -
            dashLengthPx -
            outlinePx +
            (shadowDashLengthPx - shadowInnerTipPx),
        ],
      ],
    }),
  ].join("");

  const foregroundPartsMarkup = [
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
      points: [
        [centerPx + gapPx, centerPx],
        [centerPx + gapPx + innerTipPx, centerPx - halfForegroundThicknessPx],
        [centerPx + gapPx + dashLengthPx, centerPx - halfForegroundThicknessPx],
        [centerPx + gapPx + dashLengthPx, centerPx + halfForegroundThicknessPx],
        [centerPx + gapPx + innerTipPx, centerPx + halfForegroundThicknessPx],
      ],
    }),
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
      points: [
        [centerPx - gapPx - dashLengthPx, centerPx - halfForegroundThicknessPx],
        [centerPx - gapPx - innerTipPx, centerPx - halfForegroundThicknessPx],
        [centerPx - gapPx, centerPx],
        [centerPx - gapPx - innerTipPx, centerPx + halfForegroundThicknessPx],
        [centerPx - gapPx - dashLengthPx, centerPx + halfForegroundThicknessPx],
      ],
    }),
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
      points: [
        [centerPx - halfForegroundThicknessPx, centerPx + gapPx + innerTipPx],
        [centerPx, centerPx + gapPx],
        [centerPx + halfForegroundThicknessPx, centerPx + gapPx + innerTipPx],
        [centerPx + halfForegroundThicknessPx, centerPx + gapPx + dashLengthPx],
        [centerPx - halfForegroundThicknessPx, centerPx + gapPx + dashLengthPx],
      ],
    }),
    createSvgPolygonMarkup({
      fill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
      points: [
        [centerPx - halfForegroundThicknessPx, centerPx - gapPx - dashLengthPx],
        [centerPx + halfForegroundThicknessPx, centerPx - gapPx - dashLengthPx],
        [centerPx + halfForegroundThicknessPx, centerPx - gapPx - innerTipPx],
        [centerPx, centerPx - gapPx],
        [centerPx - halfForegroundThicknessPx, centerPx - gapPx - innerTipPx],
      ],
    }),
  ].join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.sizePx}" height="${metrics.sizePx}" viewBox="0 0 ${ANNOTATION_CURSOR_OVERLAY_SIZE_PX} ${ANNOTATION_CURSOR_OVERLAY_SIZE_PX}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision">`,
    shadowPartsMarkup,
    foregroundPartsMarkup,
    "</svg>",
  ].join("");
};

const buildCrosshairCursorCanvas = ({
  styleOptions,
  metrics,
}: {
  styleOptions: CrosshairCursorResolvedStyleOptions;
  metrics: CrosshairCursorRasterMetrics;
}) => {
  const canvas = createCursorCanvas(metrics.sizePx);
  if (!canvas) {
    return null;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, metrics.sizePx, metrics.sizePx);
  context.save();
  context.translate(metrics.anchorPx, metrics.anchorPx);

  if (styleOptions.style === CROSSHAIR_CURSOR_STYLES.DEBUG_HAIRLINE) {
    renderSimpleHairlineCrosshairCursorCanvas({
      context,
      primaryColor: styleOptions.primaryColor,
      secondaryColor: styleOptions.secondaryColor,
      sizePx: metrics.sizePx,
      anchorPx: metrics.anchorPx,
    });
    context.restore();
    return canvas;
  }

  context.restore();
  return canvas;
};

export const buildCrosshairCursorDataUrl = (
  options: CrosshairCursorRenderOptions
) => {
  const resolvedOptions = resolveCrosshairCursorStyleOptions(options.style);
  const metrics = resolveCrosshairCursorRasterMetrics({
    style: resolvedOptions.style,
    devicePixelRatio: options.devicePixelRatio,
    sizePx: options.sizePx,
  });
  const cacheKey = [
    resolvedOptions.style,
    resolvedOptions.primaryColor,
    resolvedOptions.secondaryColor,
    metrics.sizePx,
    metrics.anchorPx,
    options.strokeCap ?? "round",
  ].join(":");
  const cachedDataUrl = crosshairCursorDataUrlByKey.get(cacheKey);
  if (cachedDataUrl) {
    return cachedDataUrl;
  }

  if (resolvedOptions.style === CROSSHAIR_CURSOR_STYLES.ANNOTATION_PLAYGROUND) {
    const dataUrl = encodeSvgDataUrl(
      buildAnnotationPlaygroundCursorSvgMarkup({
        metrics,
        strokeCap: options.strokeCap,
      })
    );
    crosshairCursorDataUrlByKey.set(cacheKey, dataUrl);
    return dataUrl;
  }

  const canvas = buildCrosshairCursorCanvas({
    styleOptions: resolvedOptions,
    metrics,
  });
  if (!canvas) {
    return "";
  }

  const dataUrl = canvas.toDataURL("image/png");
  crosshairCursorDataUrlByKey.set(cacheKey, dataUrl);
  return dataUrl;
};

export const resolveCrosshairCursorCssValue = ({
  style = CROSSHAIR_CURSOR_STYLES.ANNOTATION_PLAYGROUND,
  devicePixelRatio,
  sizePx,
  strokeCap,
}: CrosshairCursorCssValueOptions) => {
  const resolvedOptions = resolveCrosshairCursorStyleOptions(style);
  const metrics = resolveCrosshairCursorRasterMetrics({
    style: resolvedOptions.style,
    devicePixelRatio,
    sizePx,
  });
  const cacheKey = [
    resolvedOptions.style,
    resolvedOptions.primaryColor,
    resolvedOptions.secondaryColor,
    metrics.sizePx,
    metrics.anchorPx,
    strokeCap ?? "round",
  ].join(":");
  const cachedCursorCssValue = crosshairCursorCssValueByKey.get(cacheKey);
  if (cachedCursorCssValue) {
    return cachedCursorCssValue;
  }

  const cursorCssValue = `url("${buildCrosshairCursorDataUrl({
    style: resolvedOptions.style,
    devicePixelRatio,
    sizePx,
    strokeCap,
  })}") ${metrics.anchorPx} ${metrics.anchorPx}, crosshair`;

  crosshairCursorCssValueByKey.set(cacheKey, cursorCssValue);
  return cursorCssValue;
};
