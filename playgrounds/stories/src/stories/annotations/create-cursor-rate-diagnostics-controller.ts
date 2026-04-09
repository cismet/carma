import {
  CROSSHAIR_CURSOR_STYLES,
  resolveCrosshairCursorCssValue,
  type CrosshairCursorStyle,
} from "@carma-mapping/annotations/runtime-v2";

type CursorRateDiagnosticsMetricId =
  | "pointermove"
  | "pointerrawupdate"
  | "coalesced"
  | "distinct-position"
  | "painted-position"
  | "mousemove"
  | "animationframe"
  | "pointerraw-pressure"
  | "touchmove"
  | "touchstart"
  | "touchend"
  | "touchforcechange";

type CursorRateDiagnosticsMetricState = {
  id: CursorRateDiagnosticsMetricId;
  label: string;
  color: string;
  kind: "rate" | "ratio";
  enabled: boolean;
  supported: boolean;
  latestValue: number;
  hasSignal: boolean;
  lastEventTimeMs: number | null;
  averageWindowSamples: Array<{ timestampMs: number; value: number }>;
};

type CursorRateDiagnosticsCountMetricId = "samples-1s";

type CursorRateDiagnosticsCountMetricState = {
  id: CursorRateDiagnosticsCountMetricId;
  label: string;
  color: string;
  latestValue: number;
  averageWindowSamples: Array<{ timestampMs: number; value: number }>;
};

export type CursorRateDiagnosticsControllerOptions = {
  showTopGraphPlotting?: boolean;
  showCustomCursorPreset?: boolean;
  customCursorStyle?: CrosshairCursorStyle;
  customCursorPrimaryColor?: string;
  customCursorSecondaryColor?: string;
  hideNativeCursor?: boolean;
  nativeCursorStyle?: string;
  showPointerMove?: boolean;
  showPointerRawUpdate?: boolean;
  showCoalesced?: boolean;
  showDistinctPosition?: boolean;
  showPaintedPosition?: boolean;
  showMouseMove?: boolean;
  showAnimationFrame?: boolean;
  showTouchMove?: boolean;
  showTouchStart?: boolean;
  showTouchEnd?: boolean;
  showTouchForceChange?: boolean;
};

export type CursorRateDiagnosticsController = {
  updateOptions: (options: CursorRateDiagnosticsControllerOptions) => void;
  destroy: () => void;
};

const DEFAULT_OPTIONS: Required<CursorRateDiagnosticsControllerOptions> = {
  showTopGraphPlotting: true,
  showCustomCursorPreset: false,
  customCursorStyle: CROSSHAIR_CURSOR_STYLES.DEFAULT,
  customCursorPrimaryColor: "",
  customCursorSecondaryColor: "",
  hideNativeCursor: false,
  nativeCursorStyle: "crosshair",
  showPointerMove: true,
  showPointerRawUpdate: true,
  showCoalesced: true,
  showDistinctPosition: true,
  showPaintedPosition: true,
  showMouseMove: true,
  showAnimationFrame: true,
  showTouchMove: true,
  showTouchStart: true,
  showTouchEnd: true,
  showTouchForceChange: true,
};

const POSITION_IDLE_TEXT = "position idle";
const SAMPLE_COUNT_CHART_MAX = 360;
const RATE_CANVAS_HEIGHT_PX = 200;
const COUNT_CANVAS_HEIGHT_PX = SAMPLE_COUNT_CHART_MAX;
const CANVAS_BACKGROUND = "#f8fafc";
const TRACE_LINE_WIDTH_PX = 1;
const SIGNAL_TIMEOUT_MS = 200;
const TRAILING_AVERAGE_WINDOW_MS = 30_000;
const GRID_LINE_COLOR = "rgba(148, 163, 184, 0.42)";
const CLICK_MARKER_COLOR = "rgba(15, 23, 42, 0.95)";
const CLICK_MARKER_HALF_LENGTH_PX = 6;
const MAX_CLICK_MARKERS = 24;
const AUTO_SCALE_FALLBACK_HZ = 60;
const AUTO_SCALE_MIN_HZ = 30;
const AUTO_SCALE_MAX_HZ = 360;
const AUTO_SCALE_STEP_HZ = 5;
const AUTO_SCALE_HEADROOM = 1.08;

const ROW_LABEL_STYLE = [
  "position:absolute",
  "left:8px",
  "font:600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  "color:#0f172a",
  "text-shadow:0 0 2px rgba(255,255,255,1),0 0 6px rgba(255,255,255,0.98),0 0 10px rgba(255,255,255,0.92)",
  "transform:translateY(-50%)",
  "pointer-events:none",
  "white-space:nowrap",
].join(";");

const createMetricStates = (): CursorRateDiagnosticsMetricState[] => {
  const metrics = [
    {
      id: "pointermove",
      label: "pointermove",
      color: "#2563eb",
      kind: "rate",
    },
    {
      id: "pointerrawupdate",
      label: "pointerraw",
      color: "#ea580c",
      kind: "rate",
    },
    {
      id: "mousemove",
      label: "mousemove",
      color: "#059669",
      kind: "rate",
    },
    {
      id: "distinct-position",
      label: "distinct pos",
      color: "#0f766e",
      kind: "rate",
    },
    {
      id: "painted-position",
      label: "painted pos",
      color: "#9333ea",
      kind: "rate",
    },
    {
      id: "animationframe",
      label: "rAF",
      color: "#7c3aed",
      kind: "rate",
    },
    {
      id: "pointerraw-pressure",
      label: "raw pressure",
      color: "#b91c1c",
      kind: "ratio",
    },
    {
      id: "touchmove",
      label: "touchmove",
      color: "#0f766e",
      kind: "rate",
    },
    {
      id: "touchstart",
      label: "touchstart",
      color: "#0284c7",
      kind: "rate",
    },
    {
      id: "touchend",
      label: "touchend",
      color: "#7e22ce",
      kind: "rate",
    },
    {
      id: "touchforcechange",
      label: "touchforce",
      color: "#be185d",
      kind: "ratio",
    },
    {
      id: "coalesced",
      label: "coalesced",
      color: "#d97706",
      kind: "rate",
    },
  ] satisfies Array<{
    id: CursorRateDiagnosticsMetricId;
    label: string;
    color: string;
    kind: "rate" | "ratio";
  }>;

  return metrics.map((metric) => ({
    ...metric,
    enabled: true,
    supported: true,
    latestValue: 0,
    hasSignal: false,
    lastEventTimeMs: null,
    averageWindowSamples: [],
  }));
};

const resolveMetricEnabledState = (
  metricId: CursorRateDiagnosticsMetricId,
  options: Required<CursorRateDiagnosticsControllerOptions>
): boolean => {
  switch (metricId) {
    case "pointermove":
      return options.showPointerMove;
    case "pointerrawupdate":
      return options.showPointerRawUpdate;
    case "coalesced":
      return options.showCoalesced;
    case "distinct-position":
      return options.showDistinctPosition;
    case "painted-position":
      return options.showPaintedPosition;
    case "mousemove":
      return options.showMouseMove;
    case "animationframe":
      return options.showAnimationFrame;
    case "pointerraw-pressure":
      return options.showPointerRawUpdate;
    case "touchmove":
      return options.showTouchMove;
    case "touchstart":
      return options.showTouchStart;
    case "touchend":
      return options.showTouchEnd;
    case "touchforcechange":
      return options.showTouchForceChange;
  }
};

const syncPositionReadout = (
  positionElement: HTMLElement | null | undefined,
  surfaceElement: HTMLElement,
  clientX: number,
  clientY: number
) => {
  if (!positionElement) {
    return;
  }

  const rect = surfaceElement.getBoundingClientRect();
  const x = Math.round(clientX - rect.left);
  const y = Math.round(clientY - rect.top);
  positionElement.textContent = `position ${x}px ${y}px`;
};

const createCanvas = (chartElement: HTMLElement) => {
  chartElement.replaceChildren();
  chartElement.style.position = "absolute";
  chartElement.style.display = "grid";
  chartElement.style.gridTemplateRows = `${RATE_CANVAS_HEIGHT_PX}px ${COUNT_CANVAS_HEIGHT_PX}px`;
  chartElement.style.overflow = "hidden";
  const rateCanvas = document.createElement("canvas");
  rateCanvas.style.display = "block";
  rateCanvas.style.width = "100%";
  rateCanvas.style.height = `${RATE_CANVAS_HEIGHT_PX}px`;
  const countCanvas = document.createElement("canvas");
  countCanvas.style.display = "block";
  countCanvas.style.width = "100%";
  countCanvas.style.height = `${COUNT_CANVAS_HEIGHT_PX}px`;
  chartElement.append(rateCanvas, countCanvas);
  return {
    rateCanvas,
    countCanvas,
  };
};

const syncStatusValue = (
  element: HTMLElement | null | undefined,
  text: string
) => {
  if (element) {
    element.textContent = text;
  }
};

const formatMetricValue = (metric: CursorRateDiagnosticsMetricState) => {
  if (!metric.hasSignal) {
    return "--";
  }

  const trailingAverage =
    metric.averageWindowSamples.length > 0
      ? metric.averageWindowSamples.reduce(
          (sum, sample) => sum + sample.value,
          0
        ) / metric.averageWindowSamples.length
      : null;

  if (metric.kind === "ratio") {
    const currentPercent = Math.round(metric.latestValue * 100);
    const averagePercent =
      trailingAverage !== null ? Math.round(trailingAverage * 100) : "--";
    return `${currentPercent}% [avg30 ${averagePercent}%]`;
  }

  const currentHz = Math.round(metric.latestValue);
  const averageHz =
    trailingAverage !== null ? Math.round(trailingAverage) : "--";
  return `${currentHz} Hz [avg30 ${averageHz} Hz]`;
};

const formatCountMetricValue = (
  metric: CursorRateDiagnosticsCountMetricState
) => {
  const trailingAverage =
    metric.averageWindowSamples.length > 0
      ? metric.averageWindowSamples.reduce(
          (sum, sample) => sum + sample.value,
          0
        ) / metric.averageWindowSamples.length
      : null;
  const averageValue =
    trailingAverage !== null ? Math.round(trailingAverage) : "--";
  return `${Math.round(metric.latestValue)} [avg30 ${averageValue}]`;
};

const getMetricScaleMax = (
  metric: CursorRateDiagnosticsMetricState,
  scaleRateHz: number
) => (metric.kind === "ratio" ? 1 : Math.max(scaleRateHz, 1));

const resolveAutoScaleRateHz = (
  averagedRateHz: number,
  fallbackRateHz: number
) => {
  const baseRateHz =
    averagedRateHz > 0
      ? averagedRateHz
      : fallbackRateHz > 0
      ? fallbackRateHz
      : AUTO_SCALE_FALLBACK_HZ;
  const scaledRateHz =
    Math.round((baseRateHz * AUTO_SCALE_HEADROOM) / AUTO_SCALE_STEP_HZ) *
    AUTO_SCALE_STEP_HZ;
  return Math.max(AUTO_SCALE_MIN_HZ, Math.min(AUTO_SCALE_MAX_HZ, scaledRateHz));
};

const getRateCanvasHeightPx = (
  options: Required<CursorRateDiagnosticsControllerOptions>
) => (options.showTopGraphPlotting ? RATE_CANVAS_HEIGHT_PX : 0);

const createCountMetricStates = (): CursorRateDiagnosticsCountMetricState[] => [
  {
    id: "samples-1s",
    label: "samples / s",
    color: "#1d4ed8",
    latestValue: 0,
    averageWindowSamples: [],
  },
];

export const createCursorRateDiagnosticsController = ({
  surfaceElement,
  chartElement,
  rowLabelsElement,
  positionElement,
  rawSupportElement,
  maxRateElement,
  options,
}: {
  surfaceElement: HTMLElement;
  chartElement: HTMLElement;
  rowLabelsElement?: HTMLElement | null;
  positionElement?: HTMLElement | null;
  rawSupportElement?: HTMLElement | null;
  maxRateElement?: HTMLElement | null;
  options?: CursorRateDiagnosticsControllerOptions;
}): CursorRateDiagnosticsController => {
  let currentOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const metrics = createMetricStates();
  const countMetrics = createCountMetricStates();
  const { rateCanvas, countCanvas } = createCanvas(chartElement);
  const rateContext = rateCanvas.getContext("2d");
  const countContext = countCanvas.getContext("2d");
  const gridOverlayElement = document.createElement("div");
  gridOverlayElement.style.position = "absolute";
  gridOverlayElement.style.inset = "0";
  gridOverlayElement.style.pointerEvents = "none";
  gridOverlayElement.style.zIndex = "1";
  chartElement.append(gridOverlayElement);
  const clickMarkerLayer = document.createElement("div");
  clickMarkerLayer.style.position = "absolute";
  clickMarkerLayer.style.inset = "0";
  clickMarkerLayer.style.pointerEvents = "none";
  clickMarkerLayer.style.zIndex = "2";
  chartElement.append(clickMarkerLayer);
  let isDisposed = false;
  let animationFrameId = 0;
  let currentAnimationFrameRateHz = 0;
  let averagedAnimationFrameRateHz = 0;
  let maxObservedAverageAnimationFrameRateHz = 0;
  let autoScaleRateHz = AUTO_SCALE_FALLBACK_HZ;
  let lastRafTimestampMs = -1;
  let scrollAccumulatorMs = 0;
  let lastGridPitchPx = -1;

  const pointerRawSupported = "onpointerrawupdate" in window;
  const coalescedSupported =
    pointerRawSupported && "getCoalescedEvents" in PointerEvent.prototype;
  const touchSupported = "ontouchstart" in window;
  const touchForceChangeSupported = "ontouchforcechange" in window;
  const sampleTimestampsMs: number[] = [];
  const clickMarkers: HTMLElement[] = [];
  let latestInputPosition: { x: number; y: number } | null = null;
  let latestInputPositionVersion = 0;
  let lastDistinctInputPosition: { x: number; y: number } | null = null;
  let lastPaintedInputVersion = -1;

  // Map from metric id to the span showing live value+min+max in the row label
  const metricValueSpans = new Map<string, HTMLElement>();

  const resizeCanvas = () => {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.round(chartElement.clientWidth));
    const width = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const rateCanvasHeightPx = getRateCanvasHeightPx(currentOptions);
    const rateHeight = Math.max(
      1,
      Math.round(rateCanvasHeightPx * devicePixelRatio)
    );
    const countHeight = Math.max(
      1,
      Math.round(COUNT_CANVAS_HEIGHT_PX * devicePixelRatio)
    );
    const isUnchanged =
      rateCanvas.width === width &&
      rateCanvas.height === rateHeight &&
      countCanvas.width === width &&
      countCanvas.height === countHeight;
    if (isUnchanged) {
      return;
    }

    chartElement.style.gridTemplateRows = `${rateCanvasHeightPx}px ${COUNT_CANVAS_HEIGHT_PX}px`;
    rateCanvas.style.display = currentOptions.showTopGraphPlotting
      ? "block"
      : "none";
    rateCanvas.style.height = `${rateCanvasHeightPx}px`;
    countCanvas.style.height = `${COUNT_CANVAS_HEIGHT_PX}px`;
    rateCanvas.width = width;
    rateCanvas.height = rateHeight;
    countCanvas.width = width;
    countCanvas.height = countHeight;
    if (rateContext) {
      rateContext.fillStyle = CANVAS_BACKGROUND;
      rateContext.fillRect(0, 0, rateCanvas.width, rateCanvas.height);
    }
    if (countContext) {
      countContext.fillStyle = CANVAS_BACKGROUND;
      countContext.fillRect(0, 0, countCanvas.width, countCanvas.height);
    }
  };

  const clearCanvas = () => {
    if (rateContext) {
      rateContext.fillStyle = CANVAS_BACKGROUND;
      rateContext.fillRect(0, 0, rateCanvas.width, rateCanvas.height);
    }
    if (countContext) {
      countContext.fillStyle = CANVAS_BACKGROUND;
      countContext.fillRect(0, 0, countCanvas.width, countCanvas.height);
    }
  };

  const syncCursorStyle = () => {
    const useCustomCursor =
      currentOptions.showCustomCursorPreset ||
      currentOptions.customCursorStyle === CROSSHAIR_CURSOR_STYLES.DEFAULT ||
      currentOptions.customCursorStyle ===
        CROSSHAIR_CURSOR_STYLES.SIMPLE_HAIRLINE;

    if (useCustomCursor) {
      surfaceElement.style.cursor = resolveCrosshairCursorCssValue({
        style: currentOptions.customCursorStyle,
        primaryColor: currentOptions.customCursorPrimaryColor || undefined,
        secondaryColor: currentOptions.customCursorSecondaryColor || undefined,
      });
      return;
    }

    if (currentOptions.hideNativeCursor) {
      surfaceElement.style.cursor = "none";
      return;
    }

    surfaceElement.style.cursor = currentOptions.nativeCursorStyle;
  };

  const syncRateStatus = () => {
    syncStatusValue(
      maxRateElement,
      `auto ${Math.max(
        Math.round(autoScaleRateHz),
        1
      )} Hz rAF ${currentAnimationFrameRateHz.toFixed(1)} Hz grid ${Math.max(
        Math.round(maxObservedAverageAnimationFrameRateHz),
        1
      )} px`
    );
  };

  const syncStaticGridOverlay = () => {
    const gridPitchPx = Math.max(
      Math.round(maxObservedAverageAnimationFrameRateHz),
      1
    );
    if (gridPitchPx === lastGridPitchPx) {
      return;
    }

    lastGridPitchPx = gridPitchPx;
    gridOverlayElement.style.backgroundImage = `repeating-linear-gradient(to right, transparent 0 ${
      gridPitchPx - 1
    }px, ${GRID_LINE_COLOR} ${gridPitchPx - 1}px ${gridPitchPx}px)`;
    gridOverlayElement.style.backgroundSize = `${gridPitchPx}px 100%`;
    gridOverlayElement.style.backgroundPosition = "right top";
  };

  const clearClickMarkers = () => {
    clickMarkerLayer.replaceChildren();
    clickMarkers.length = 0;
  };

  const createClickCrosshairMarker = () => {
    const marker = document.createElement("div");
    marker.style.position = "absolute";
    marker.style.width = `${CLICK_MARKER_HALF_LENGTH_PX * 2 + 1}px`;
    marker.style.height = `${CLICK_MARKER_HALF_LENGTH_PX * 2 + 1}px`;
    marker.style.transform = "translate(-50%, -50%)";
    marker.style.pointerEvents = "none";

    const horizontalLine = document.createElement("div");
    horizontalLine.style.position = "absolute";
    horizontalLine.style.left = "0";
    horizontalLine.style.right = "0";
    horizontalLine.style.top = `${CLICK_MARKER_HALF_LENGTH_PX}px`;
    horizontalLine.style.height = "1px";
    horizontalLine.style.background = CLICK_MARKER_COLOR;

    const verticalLine = document.createElement("div");
    verticalLine.style.position = "absolute";
    verticalLine.style.top = "0";
    verticalLine.style.bottom = "0";
    verticalLine.style.left = `${CLICK_MARKER_HALF_LENGTH_PX}px`;
    verticalLine.style.width = "1px";
    verticalLine.style.background = CLICK_MARKER_COLOR;

    marker.append(horizontalLine, verticalLine);
    return marker;
  };

  const paintClickMarker = (clientX: number, clientY: number) => {
    const chartRect = chartElement.getBoundingClientRect();
    const marker = createClickCrosshairMarker();
    marker.style.position = "absolute";
    marker.style.left = `${Math.round(clientX - chartRect.left)}px`;
    marker.style.top = `${Math.round(clientY - chartRect.top)}px`;
    clickMarkerLayer.append(marker);
    clickMarkers.push(marker);
    if (clickMarkers.length > MAX_CLICK_MARKERS) {
      const oldestMarker = clickMarkers.shift();
      oldestMarker?.remove();
    }
  };

  const getVisibleMetrics = () =>
    metrics.filter((metric) => metric.enabled && metric.supported);

  // Build DOM label structure once; call again when visible metric set changes.
  // Stores refs to value spans in metricValueSpans for cheap per-frame updates.
  const buildRowLabels = () => {
    if (!rowLabelsElement) {
      return;
    }

    metricValueSpans.clear();
    rowLabelsElement.replaceChildren();

    const visibleRateMetrics = currentOptions.showTopGraphPlotting
      ? getVisibleMetrics()
      : [];
    const rateCanvasHeightPx = getRateCanvasHeightPx(currentOptions);
    const rateRowHeight =
      visibleRateMetrics.length > 0
        ? rateCanvasHeightPx / visibleRateMetrics.length
        : 0;
    visibleRateMetrics.forEach((metric, rowIndex) => {
      const row = document.createElement("div");
      row.style.cssText = `${ROW_LABEL_STYLE};top:${
        rateRowHeight * (rowIndex + 0.5)
      }px`;
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "color:#020617";
      nameSpan.textContent = metric.label + "  ";
      const valueSpan = document.createElement("span");
      valueSpan.style.cssText = "color:#020617";
      valueSpan.textContent = "--";
      metricValueSpans.set(metric.id, valueSpan);
      row.append(nameSpan, valueSpan);
      rowLabelsElement.append(row);
    });

    const countRowHeight =
      COUNT_CANVAS_HEIGHT_PX / Math.max(countMetrics.length, 1);
    countMetrics.forEach((metric, rowIndex) => {
      const row = document.createElement("div");
      row.style.cssText = `${ROW_LABEL_STYLE};top:${
        rateCanvasHeightPx + countRowHeight * (rowIndex + 0.5)
      }px`;
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "color:#020617";
      nameSpan.textContent = metric.label + "  ";
      const valueSpan = document.createElement("span");
      valueSpan.style.cssText = "color:#020617";
      valueSpan.textContent = "--";
      metricValueSpans.set(metric.id, valueSpan);
      row.append(nameSpan, valueSpan);
      rowLabelsElement.append(row);
    });
  };

  // Update only the textContent of stored value spans — no DOM reconstruction.
  const updateLabelValues = () => {
    getVisibleMetrics().forEach((metric) => {
      const el = metricValueSpans.get(metric.id);
      if (!el) {
        return;
      }
      if (!metric.hasSignal) {
        el.textContent = "--";
        return;
      }
      el.textContent = formatMetricValue(metric);
    });

    countMetrics.forEach((metric) => {
      const el = metricValueSpans.get(metric.id);
      if (!el) {
        return;
      }
      el.textContent = formatCountMetricValue(metric);
    });
  };

  const drawNextRateColumn = () => {
    if (
      !currentOptions.showTopGraphPlotting ||
      !rateContext ||
      rateCanvas.width <= 1
    ) {
      return;
    }

    rateContext.drawImage(rateCanvas, -1, 0);
    rateContext.fillStyle = CANVAS_BACKGROUND;
    rateContext.fillRect(rateCanvas.width - 1, 0, 1, rateCanvas.height);

    const visibleMetrics = getVisibleMetrics();
    const rowCount = Math.max(visibleMetrics.length, 1);
    const rowHeight = rateCanvas.height / rowCount;

    const now = performance.now();
    visibleMetrics.forEach((metric, rowIndex) => {
      if (
        !metric.hasSignal ||
        metric.lastEventTimeMs === null ||
        now - metric.lastEventTimeMs > SIGNAL_TIMEOUT_MS
      ) {
        return;
      }

      const safeMetricMax = getMetricScaleMax(metric, autoScaleRateHz);
      const clampedValue = Math.min(
        Math.max(metric.latestValue, 0),
        safeMetricMax
      );
      const rowTop = rowIndex * rowHeight;
      const rowBottom = rowTop + rowHeight - 1;
      const ratio = clampedValue / safeMetricMax;
      const y = Math.round(rowBottom - ratio * Math.max(rowHeight - 1, 1));
      rateContext.strokeStyle = metric.color;
      rateContext.lineWidth = TRACE_LINE_WIDTH_PX;
      rateContext.beginPath();
      rateContext.moveTo(rateCanvas.width - 1, rowBottom);
      rateContext.lineTo(rateCanvas.width - 1, y);
      rateContext.stroke();
    });
  };

  const drawNextCountColumn = () => {
    if (!countContext || countCanvas.width <= 1) {
      return;
    }

    countContext.drawImage(countCanvas, -1, 0);
    countContext.fillStyle = CANVAS_BACKGROUND;
    countContext.fillRect(countCanvas.width - 1, 0, 1, countCanvas.height);

    const rowHeight = countCanvas.height / countMetrics.length;
    const safeMaxCount = SAMPLE_COUNT_CHART_MAX;

    countMetrics.forEach((metric, rowIndex) => {
      const clampedValue = Math.min(
        Math.max(metric.latestValue, 0),
        safeMaxCount
      );
      const rowTop = rowIndex * rowHeight;
      const rowBottom = rowTop + rowHeight - 1;
      const ratio = clampedValue / safeMaxCount;
      const y = Math.round(rowBottom - ratio * Math.max(rowHeight - 1, 1));
      countContext.strokeStyle = metric.color;
      countContext.lineWidth = TRACE_LINE_WIDTH_PX;
      countContext.beginPath();
      countContext.moveTo(countCanvas.width - 1, rowBottom);
      countContext.lineTo(countCanvas.width - 1, y);
      countContext.stroke();
    });
  };

  const applySupportState = () => {
    metrics.forEach((metric) => {
      metric.supported =
        metric.id === "pointerrawupdate" || metric.id === "pointerraw-pressure"
          ? pointerRawSupported
          : metric.id === "coalesced"
          ? coalescedSupported
          : metric.id === "touchforcechange"
          ? touchForceChangeSupported
          : metric.id === "touchmove" ||
            metric.id === "touchstart" ||
            metric.id === "touchend"
          ? touchSupported
          : true;
      metric.enabled =
        resolveMetricEnabledState(metric.id, currentOptions) &&
        metric.supported;
      metric.latestValue = 0;
      metric.hasSignal = false;
      metric.lastEventTimeMs = null;
      metric.averageWindowSamples = [];
    });

    countMetrics.forEach((metric) => {
      metric.latestValue = 0;
      metric.averageWindowSamples = [];
    });

    if (rawSupportElement) {
      rawSupportElement.textContent = pointerRawSupported
        ? "raw supported"
        : "raw unsupported";
    }

    syncRateStatus();
    buildRowLabels();
    syncCursorStyle();
    syncStaticGridOverlay();
  };

  const updateSampleCounts = (nowMs: number) => {
    while (
      sampleTimestampsMs.length > 0 &&
      nowMs - sampleTimestampsMs[0] > 1000
    ) {
      sampleTimestampsMs.shift();
    }

    const samples1sMetric = countMetrics.find(
      (metric) => metric.id === "samples-1s"
    );
    if (samples1sMetric) {
      samples1sMetric.latestValue = sampleTimestampsMs.length;
      samples1sMetric.averageWindowSamples.push({
        timestampMs: nowMs,
        value: samples1sMetric.latestValue,
      });
      while (
        samples1sMetric.averageWindowSamples.length > 0 &&
        nowMs - samples1sMetric.averageWindowSamples[0].timestampMs >
          TRAILING_AVERAGE_WINDOW_MS
      ) {
        samples1sMetric.averageWindowSamples.shift();
      }
    }
  };

  const registerSampleTimestamp = () => {
    const nowMs = performance.now();
    sampleTimestampsMs.push(nowMs);
    updateSampleCounts(nowMs);
  };

  const pushMetricValue = (
    metricId: CursorRateDiagnosticsMetricId,
    value: number
  ) => {
    const metric = metrics.find((entry) => entry.id === metricId);
    if (!metric || !metric.enabled || !Number.isFinite(value)) {
      return;
    }

    metric.latestValue = value;
    metric.hasSignal = true;
    const nowMs = performance.now();
    metric.lastEventTimeMs = nowMs;
    metric.averageWindowSamples.push({
      timestampMs: nowMs,
      value,
    });
    while (
      metric.averageWindowSamples.length > 0 &&
      nowMs - metric.averageWindowSamples[0].timestampMs >
        TRAILING_AVERAGE_WINDOW_MS
    ) {
      metric.averageWindowSamples.shift();
    }
  };

  const metricTimestampById = new Map<CursorRateDiagnosticsMetricId, number>();

  const markRateEvent = (
    metricId: CursorRateDiagnosticsMetricId,
    now = performance.now()
  ) => {
    const previousTimestamp = metricTimestampById.get(metricId) ?? null;
    metricTimestampById.set(metricId, now);
    if (previousTimestamp === null) {
      return;
    }

    const intervalMs = now - previousTimestamp;
    if (intervalMs <= 0) {
      return;
    }

    const nextRateHz = 1000 / intervalMs;
    if (metricId === "animationframe") {
      currentAnimationFrameRateHz = nextRateHz;
      averagedAnimationFrameRateHz =
        averagedAnimationFrameRateHz <= 0
          ? nextRateHz
          : averagedAnimationFrameRateHz * 0.92 + nextRateHz * 0.08;
      autoScaleRateHz = resolveAutoScaleRateHz(
        averagedAnimationFrameRateHz,
        nextRateHz
      );
      maxObservedAverageAnimationFrameRateHz = Math.max(
        Math.max(
          maxObservedAverageAnimationFrameRateHz,
          averagedAnimationFrameRateHz
        ),
        1
      );
      syncRateStatus();
      syncStaticGridOverlay();
    }

    pushMetricValue(metricId, nextRateHz);
  };

  const registerInputPosition = (
    clientX: number,
    clientY: number,
    now = performance.now()
  ) => {
    syncPositionReadout(positionElement, surfaceElement, clientX, clientY);
    latestInputPosition = {
      x: clientX,
      y: clientY,
    };
    latestInputPositionVersion += 1;

    const isDistinct =
      !lastDistinctInputPosition ||
      lastDistinctInputPosition.x !== clientX ||
      lastDistinctInputPosition.y !== clientY;
    if (isDistinct) {
      lastDistinctInputPosition = {
        x: clientX,
        y: clientY,
      };
      markRateEvent("distinct-position", now);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    registerInputPosition(event.clientX, event.clientY, event.timeStamp);
    registerSampleTimestamp();
    markRateEvent("pointermove");
  };

  const handlePointerRawUpdate = (event: Event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }

    registerInputPosition(event.clientX, event.clientY, event.timeStamp);
    registerSampleTimestamp();
    markRateEvent("pointerrawupdate");
    if (typeof event.pressure === "number" && event.pressure > 0) {
      pushMetricValue("pointerraw-pressure", event.pressure);
    }
    if (coalescedSupported) {
      const coalesced = (
        event as PointerEvent & { getCoalescedEvents(): PointerEvent[] }
      ).getCoalescedEvents();
      coalesced.forEach((e) => markRateEvent("coalesced", e.timeStamp));
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    registerInputPosition(event.clientX, event.clientY, event.timeStamp);
    registerSampleTimestamp();
    markRateEvent("mousemove");
  };

  const handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) {
      return;
    }

    registerInputPosition(touch.clientX, touch.clientY, event.timeStamp);
    registerSampleTimestamp();
    markRateEvent("touchmove");
  };

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (touch) {
      registerInputPosition(touch.clientX, touch.clientY, event.timeStamp);
    }
    markRateEvent("touchstart");
  };

  const handleTouchEnd = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    if (touch) {
      registerInputPosition(touch.clientX, touch.clientY, event.timeStamp);
    }
    markRateEvent("touchend");
  };

  const handleTouchForceChange = (event: Event) => {
    const touchEvent = event as TouchEvent;
    const touch = touchEvent.changedTouches?.[0];
    if (!touch) {
      return;
    }
    markRateEvent("touchforcechange");
    const force = (touch as Touch & { force?: number }).force;
    if (typeof force === "number") {
      pushMetricValue("touchforcechange", force);
    }
  };

  const handlePointerLeave = () => {
    if (positionElement) {
      positionElement.textContent = POSITION_IDLE_TEXT;
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    paintClickMarker(event.clientX, event.clientY);
  };

  // Time-driven scroll: advance 1px per (1000/SCROLL_RATE_PX_PER_S) ms
  // regardless of actual display frame rate.
  const tickAnimationFrame = (timestampMs: number) => {
    if (isDisposed) {
      return;
    }

    if (lastRafTimestampMs >= 0) {
      const deltaMs = Math.min(timestampMs - lastRafTimestampMs, 100);
      scrollAccumulatorMs += deltaMs;
      const msPerPx = 1000 / Math.max(currentAnimationFrameRateHz, 1);
      while (scrollAccumulatorMs >= msPerPx) {
        scrollAccumulatorMs -= msPerPx;
        drawNextRateColumn();
        drawNextCountColumn();
      }
    }
    lastRafTimestampMs = timestampMs;

    updateSampleCounts(timestampMs);
    markRateEvent("animationframe", timestampMs);
    if (
      latestInputPosition &&
      latestInputPositionVersion !== lastPaintedInputVersion
    ) {
      lastPaintedInputVersion = latestInputPositionVersion;
      markRateEvent("painted-position", timestampMs);
    }
    updateLabelValues();
    animationFrameId = window.requestAnimationFrame(tickAnimationFrame);
  };

  const rebuild = (nextOptions?: CursorRateDiagnosticsControllerOptions) => {
    currentOptions = {
      ...currentOptions,
      ...nextOptions,
    };
    lastRafTimestampMs = -1;
    scrollAccumulatorMs = 0;
    lastGridPitchPx = -1;
    currentAnimationFrameRateHz = 0;
    averagedAnimationFrameRateHz = 0;
    maxObservedAverageAnimationFrameRateHz = 0;
    autoScaleRateHz = AUTO_SCALE_FALLBACK_HZ;
    resizeCanvas();
    clearCanvas();
    clearClickMarkers();
    metricTimestampById.clear();
    sampleTimestampsMs.length = 0;
    latestInputPosition = null;
    latestInputPositionVersion = 0;
    lastDistinctInputPosition = null;
    lastPaintedInputVersion = -1;
    applySupportState();
  };

  resizeCanvas();
  clearCanvas();
  applySupportState();
  syncStaticGridOverlay();

  surfaceElement.addEventListener("pointermove", handlePointerMove, {
    passive: true,
  });
  surfaceElement.addEventListener("pointerrawupdate", handlePointerRawUpdate, {
    passive: true,
  });
  surfaceElement.addEventListener("mousemove", handleMouseMove, {
    passive: true,
  });
  surfaceElement.addEventListener("touchmove", handleTouchMove, {
    passive: true,
  });
  surfaceElement.addEventListener("touchstart", handleTouchStart, {
    passive: true,
  });
  surfaceElement.addEventListener("touchend", handleTouchEnd, {
    passive: true,
  });
  surfaceElement.addEventListener("touchforcechange", handleTouchForceChange, {
    passive: true,
  });
  surfaceElement.addEventListener("pointerleave", handlePointerLeave, {
    passive: true,
  });
  chartElement.addEventListener("pointerdown", handlePointerDown, {
    passive: true,
  });
  window.addEventListener("resize", resizeCanvas, {
    passive: true,
  });

  animationFrameId = window.requestAnimationFrame(tickAnimationFrame);

  if (positionElement) {
    positionElement.textContent = POSITION_IDLE_TEXT;
  }
  syncCursorStyle();

  return {
    updateOptions: (nextOptions) => {
      rebuild(nextOptions);
    },
    destroy: () => {
      isDisposed = true;
      window.cancelAnimationFrame(animationFrameId);
      surfaceElement.removeEventListener("pointermove", handlePointerMove);
      surfaceElement.removeEventListener(
        "pointerrawupdate",
        handlePointerRawUpdate
      );
      surfaceElement.removeEventListener("mousemove", handleMouseMove);
      surfaceElement.removeEventListener("touchmove", handleTouchMove);
      surfaceElement.removeEventListener("touchstart", handleTouchStart);
      surfaceElement.removeEventListener("touchend", handleTouchEnd);
      surfaceElement.removeEventListener(
        "touchforcechange",
        handleTouchForceChange
      );
      surfaceElement.removeEventListener("pointerleave", handlePointerLeave);
      chartElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", resizeCanvas);
      gridOverlayElement.remove();
      chartElement.replaceChildren();
      clickMarkerLayer.remove();
      if (rowLabelsElement) {
        rowLabelsElement.replaceChildren();
      }
      if (positionElement) {
        positionElement.textContent = POSITION_IDLE_TEXT;
      }
      if (rawSupportElement) {
        rawSupportElement.textContent = "";
      }
      syncStatusValue(maxRateElement, "");
      surfaceElement.style.cursor = "";
    },
  };
};
