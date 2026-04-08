import { renderSimpleHairlineCrosshairCursorCanvas } from "./renderSimpleHairlineCrosshairCursorCanvas";

export const CROSSHAIR_CURSOR_SIZE_PX = 48;
export const CROSSHAIR_CURSOR_ANCHOR_PX = 24;
export const CROSSHAIR_CURSOR_DESIGN_SIZE_SERIES_PX = [
  16,
  24,
  32,
  48,
  64,
  96,
  128,
] as const;
export const SIMPLE_HAIRLINE_CURSOR_SIZE_SERIES_PX = [
  16,
  24,
  32,
  48,
  64,
] as const;

export const CROSSHAIR_CURSOR_STYLES = {
  DEFAULT: "default",
  SIMPLE_HAIRLINE: "simple-hairline",
} as const;

export type CrosshairCursorStyle =
  (typeof CROSSHAIR_CURSOR_STYLES)[keyof typeof CROSSHAIR_CURSOR_STYLES];

export type CrosshairCursorRenderOptions = {
  style?: CrosshairCursorStyle;
  primaryColor?: string;
  secondaryColor?: string;
  devicePixelRatio?: number;
  sizePx?: number;
};

export type CrosshairCursorCssValueOptions = CrosshairCursorRenderOptions;

const crosshairCursorCssValueByKey = new Map<string, string>();
const crosshairCursorDataUrlByKey = new Map<string, string>();

const resolveCrosshairCursorStyleOptions = (
  options: CrosshairCursorRenderOptions
) => {
  const style = options.style ?? CROSSHAIR_CURSOR_STYLES.DEFAULT;

  switch (style) {
    case CROSSHAIR_CURSOR_STYLES.SIMPLE_HAIRLINE:
      return {
        style,
        primaryColor: options.primaryColor ?? "rgba(255,255,255,0.98)",
        secondaryColor: options.secondaryColor ?? "rgba(0,0,0,0.98)",
      };
    case CROSSHAIR_CURSOR_STYLES.DEFAULT:
    default:
      return {
        style: CROSSHAIR_CURSOR_STYLES.DEFAULT,
        primaryColor: options.primaryColor ?? "hsla(0,0%,100%,0.98)",
        secondaryColor: options.secondaryColor ?? "rgba(0,0,0,0.98)",
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

const resolveNormalizedDevicePixelRatio = (
  devicePixelRatio?: number
) => {
  if (typeof devicePixelRatio === "number" && Number.isFinite(devicePixelRatio)) {
    return Math.max(devicePixelRatio, 1);
  }

  if (typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)) {
    return Math.max(window.devicePixelRatio, 1);
  }

  return 1;
};

const resolveSimpleHairlineCursorSizePx = (devicePixelRatio?: number) => {
  const normalizedDevicePixelRatio = resolveNormalizedDevicePixelRatio(
    devicePixelRatio
  );
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
        style === CROSSHAIR_CURSOR_STYLES.SIMPLE_HAIRLINE
          ? Math.max(Math.floor(resolvedSizePx / 2) - 1, 0)
          : Math.max(Math.floor(resolvedSizePx / 2), 0),
    };
  }

  if (style === CROSSHAIR_CURSOR_STYLES.SIMPLE_HAIRLINE) {
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

const drawDefaultCrosshairArm = ({
  context,
  primaryColor,
  secondaryColor,
}: {
  context: CanvasRenderingContext2D;
  primaryColor: string;
  secondaryColor: string;
}) => {
  context.strokeStyle = secondaryColor;
  context.lineWidth = 0.5;
  context.lineCap = "butt";
  context.beginPath();
  context.moveTo(4, 0);
  context.lineTo(8, 0);
  context.stroke();

  context.strokeStyle = primaryColor;
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(8, 0);
  context.lineTo(16, 0);
  context.stroke();
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

  if (styleOptions.style === CROSSHAIR_CURSOR_STYLES.SIMPLE_HAIRLINE) {
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

  context.fillStyle = styleOptions.primaryColor;
  context.fillRect(0, 0, 1, 1);

  for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
    context.save();
    context.rotate((Math.PI / 2) * rotationIndex);
    drawDefaultCrosshairArm({
      context,
      primaryColor: styleOptions.primaryColor,
      secondaryColor: styleOptions.secondaryColor,
    });
    context.restore();
  }

  context.restore();
  return canvas;
};

export const buildCrosshairCursorDataUrl = (
  options: CrosshairCursorRenderOptions
) => {
  const resolvedOptions = resolveCrosshairCursorStyleOptions(options);
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
  ].join(":");
  const cachedDataUrl = crosshairCursorDataUrlByKey.get(cacheKey);
  if (cachedDataUrl) {
    return cachedDataUrl;
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
  style = CROSSHAIR_CURSOR_STYLES.DEFAULT,
  primaryColor,
  secondaryColor,
  devicePixelRatio,
  sizePx,
}: CrosshairCursorCssValueOptions) => {
  const resolvedOptions = resolveCrosshairCursorStyleOptions({
    style,
    primaryColor,
    secondaryColor,
  });
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
  ].join(":");
  const cachedCursorCssValue = crosshairCursorCssValueByKey.get(cacheKey);
  if (cachedCursorCssValue) {
    return cachedCursorCssValue;
  }

  const cursorCssValue = `url("${buildCrosshairCursorDataUrl({
    style: resolvedOptions.style,
    primaryColor: resolvedOptions.primaryColor,
    secondaryColor: resolvedOptions.secondaryColor,
    devicePixelRatio,
    sizePx,
  })}") ${metrics.anchorPx} ${metrics.anchorPx}, crosshair`;

  crosshairCursorCssValueByKey.set(cacheKey, cursorCssValue);
  return cursorCssValue;
};
