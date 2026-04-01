import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  axisBottom,
  axisLeft,
  curveLinear,
  curveStepAfter,
  extent,
  format as d3Format,
  interpolateViridis,
  line as d3Line,
  scaleLinear,
  scaleLog,
  scaleSequential,
  select,
} from "d3";

import {
  DEFAULT_LEAFLET_TILESIZE,
  EARTH_CIRCUMFERENCE,
  WEB_MERCATOR_MAX_LATITUDE_DEG,
  metersPerPixel,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "@carma-geo/utils";
import { degToRadNumeric } from "@carma-units";
import type { Degrees, Meters, Radians } from "@carma-units";

import { GeoChartStoryFrame } from "./geo-chart-story-frame";
import { GEO_STORY_STYLES } from "./geo-story-styles";
import {
  createPrimaryYAxisReadoutLabel,
  createBottomXAxisReadoutLabel,
  PlotHoverReadoutLayers,
  readGuideLeftXFromPrimaryYAxisReadout,
  readGuideBottomYFromBottomXAxisReadout,
  readPrimaryYAxisTitleX,
  readSampleAnchoredTooltipBox,
} from "./plot-hover-readout";
import { VerticalPlotReferenceLine } from "./plot-reference-line";
export type MercatorZoomStoryArgs = {
  standardRangePreset: StandardRangePreset;
  standardRangeCustom: number;
  standardFovDeg: number;
  standardLatitudeDeg: number;
  baseTileSizePx: BaseTileSizePx;
  latitudeMode: LatitudeDisplayMode;
  zQuantizeStep: ZQuantizeStep;
};

export type MercatorZoomReferenceStoryArgs = {
  baseTileSizePx: BaseTileSizePx;
  standardFovDeg: number;
  standardLatitudeDeg: number;
  minimumForwardZoom: number;
  maximumForwardZoom: number;
};

type ZoomLinePoint = {
  latitudeDeg: number;
  rawZoom: number;
  displayZoom: number;
};

type ZoomContourPoint = {
  latitudeDeg: number;
  resolutionMPerPx: number;
};

type RangeContourPoint = {
  latitudeDeg: number;
  rangeM: number;
};

type HeatmapReadout = {
  latitudeDeg: number;
  rangeM?: number;
  fovDeg: number;
  rawZoom: number;
  displayZoom: number;
  centerResolutionMPerPx: number;
  plotX: number;
  plotY: number;
};

type PinnedHeatmapReadout = HeatmapReadout & {
  id: string;
};

type LineReadout = {
  latitudeDeg: number;
  rawZoom: number;
  displayZoom: number;
  plotX: number;
  plotY: number;
};

type PinnedLineReadout = LineReadout & {
  id: string;
};

type HeatmapRow = {
  resolutionMPerPx: number;
  fovDeg: number;
};

type RangeHeatmapRow = {
  rangeM: number;
  centerResolutionMPerPx: number;
};

const HEATMAP_Y_READOUT_WIDTH = 150;
const RANGE_HEATMAP_Y_READOUT_WIDTH = 112;
const LINE_Y_READOUT_WIDTH = 64;

export const LATITUDE_DISPLAY_MODES = {
  MERCATOR_CLAMP: "mercator-square",
  CESIUM_EXTENDED: "mercator-extreme",
} as const;

export type LatitudeDisplayMode =
  (typeof LATITUDE_DISPLAY_MODES)[keyof typeof LATITUDE_DISPLAY_MODES];

export const STANDARD_RANGE_PRESETS = {
  CUSTOM: "custom",
  M_100: "100",
  M_250: "250",
  M_500: "500",
  M_1000: "1000",
  M_2500: "2500",
  M_5000: "5000",
} as const;

export type StandardRangePreset =
  (typeof STANDARD_RANGE_PRESETS)[keyof typeof STANDARD_RANGE_PRESETS];

export const Z_QUANTIZE_STEPS = {
  OFF: "none",
  TENTH: "1/10",
  FIFTH: "1/5",
  QUARTER: "1/4",
  THIRD: "1/3",
  HALF: "1/2",
  ONE: "1/1",
} as const;

const INLINE_CODE_STYLE = {
  fontFamily:
    'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: "0.95em",
} as const;

export type ZQuantizeStep =
  (typeof Z_QUANTIZE_STEPS)[keyof typeof Z_QUANTIZE_STEPS];

export const BASE_TILE_SIZES_PX = {
  PX_256: 256,
  PX_512: 512,
} as const;

export type BaseTileSizePx =
  (typeof BASE_TILE_SIZES_PX)[keyof typeof BASE_TILE_SIZES_PX];

const Z_QUANTIZE_STEP_VALUES: Record<ZQuantizeStep, number | null> = {
  [Z_QUANTIZE_STEPS.OFF]: null,
  [Z_QUANTIZE_STEPS.TENTH]: 0.1,
  [Z_QUANTIZE_STEPS.FIFTH]: 0.2,
  [Z_QUANTIZE_STEPS.QUARTER]: 0.25,
  [Z_QUANTIZE_STEPS.THIRD]: 1 / 3,
  [Z_QUANTIZE_STEPS.HALF]: 0.5,
  [Z_QUANTIZE_STEPS.ONE]: 1,
};

const STANDARD_RANGE_PRESET_VALUES_M: Record<
  StandardRangePreset,
  number | null
> = {
  [STANDARD_RANGE_PRESETS.CUSTOM]: null,
  [STANDARD_RANGE_PRESETS.M_100]: 100,
  [STANDARD_RANGE_PRESETS.M_250]: 250,
  [STANDARD_RANGE_PRESETS.M_500]: 500,
  [STANDARD_RANGE_PRESETS.M_1000]: 1000,
  [STANDARD_RANGE_PRESETS.M_2500]: 2500,
  [STANDARD_RANGE_PRESETS.M_5000]: 5000,
};

export const STANDARD_RANGE_PRESET_LABELS: Record<StandardRangePreset, string> =
  {
    [STANDARD_RANGE_PRESETS.CUSTOM]: "Custom",
    [STANDARD_RANGE_PRESETS.M_100]: "100 m",
    [STANDARD_RANGE_PRESETS.M_250]: "250 m",
    [STANDARD_RANGE_PRESETS.M_500]: "500 m",
    [STANDARD_RANGE_PRESETS.M_1000]: "1000 m",
    [STANDARD_RANGE_PRESETS.M_2500]: "2500 m",
    [STANDARD_RANGE_PRESETS.M_5000]: "5000 m",
  };

export const DEFAULT_STANDARD_RANGE_M = 1000 as Meters;
const LATITUDE_STEP_DEG = 0.2;
const HEATMAP_LOG2_RESOLUTION_STEP = 0.025;
const MIN_EFFECTIVE_FOV_DEG = 1;
const MIN_RANGE_HEATMAP_M = 1 as Meters;
const MAX_RANGE_HEATMAP_M = 10_000 as Meters;
const RANGE_HEATMAP_LOG2_RANGE_STEP = 0.05;
const FOV_HEATMAP_STEP_DEG = 0.25;
const VIEWPORT_WIDTH_PX = 1280;
const VIEWPORT_HEIGHT_PX = 720;
const PLOT_OUTER_WIDTH_PX = 980;
const HEATMAP_OUTER_WIDTH_PX = PLOT_OUTER_WIDTH_PX;
const HEATMAP_OUTER_HEIGHT_PX = 560;
const LINE_OUTER_WIDTH_PX = PLOT_OUTER_WIDTH_PX;
const LINE_OUTER_HEIGHT_PX = 320;
const RANGE_HEATMAP_OUTER_WIDTH_PX = PLOT_OUTER_WIDTH_PX;
const RANGE_HEATMAP_OUTER_HEIGHT_PX = 560;

const HEATMAP_MARGIN = {
  top: 28,
  right: 28,
  bottom: 104,
  left: 136,
} as const;

const LINE_MARGIN = {
  top: 18,
  right: 28,
  bottom: 54,
  left: 136,
} as const;

const RANGE_HEATMAP_MARGIN = {
  top: 28,
  right: 28,
  bottom: 104,
  left: 136,
} as const;

const TABLE_HEADER_STICKY_TOP_PX = GEO_STORY_STYLES.chrome.topBarHeightPx;
const DEFAULT_REFERENCE_MINIMUM_FORWARD_ZOOM = 0;
const DEFAULT_REFERENCE_MAXIMUM_FORWARD_ZOOM = 22;
const TABLE_SECTION_HEADER_HEIGHT_PX = 27;

const buildSteppedRange = (
  start: number,
  end: number,
  step: number
): number[] => {
  const values: number[] = [];
  for (
    let current = start;
    current <= end + step * 0.25;
    current = Number((current + step).toFixed(6))
  ) {
    values.push(Number(Math.min(current, end).toFixed(6)));
  }
  return values;
};

const formatRangeM = (m: number): string => {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m >= 1_000_000) return `${d3Format(".4~g")(m / 1_000_000)} Mm`;
  if (m >= 1_000) return `${d3Format(".4~g")(m / 1_000)} km`;
  return `${d3Format(m >= 1 ? ".4~g" : m >= 0.01 ? ".3f" : ".4f")(m)} m`;
};

export const readLatitudeResolutionPlotLabel = (rangeM: number) =>
  `Zoom by Latitude and Resolution at ${formatRangeM(rangeM)} Range`;

export const readLatitudeRangePlotLabel = (fovDeg: number) =>
  `Zoom by Latitude and Range at Field of View ${formatDegrees(fovDeg)}`;

export const readLatitudePlotLabel = (rangeM: number, fovDeg: number) =>
  `Zoom by Latitude at ${formatRangeM(rangeM)} Range and ${formatDegrees(
    fovDeg
  )} Field of View`;

const formatMPerPx = (v: number): string => {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000) return `${d3Format(".4~g")(v / 1_000)} km/px`;
  return `${d3Format(v >= 1 ? ".4~g" : v >= 0.01 ? ".3f" : ".4f")(v)} m/px`;
};

const formatResolutionAxisValue = (resolutionMPerPx: number): string =>
  Number.isFinite(resolutionMPerPx)
    ? d3Format(
        resolutionMPerPx >= 1 ? ".2f" : resolutionMPerPx >= 0.01 ? ".3f" : ".4f"
      )(resolutionMPerPx)
    : "";

const formatDegrees = (value: number, format = ".1f"): string =>
  Number.isFinite(value) ? `${d3Format(format)(value)}°` : "—";

const formatLatitudeTickValue = (value: number): string =>
  formatDegrees(Number(value), Number.isInteger(Number(value)) ? ".0f" : ".3f");

const drawHeatmapRaster = ({
  canvas,
  width,
  height,
  columnCount,
  rowCount,
  values,
  colorScale,
  targetX,
  targetY,
  targetWidth,
  targetHeight,
}: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  columnCount: number;
  rowCount: number;
  values: number[][];
  colorScale: (value: number) => string;
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, width, height);
  const rasterCanvas = document.createElement("canvas");
  rasterCanvas.width = columnCount;
  rasterCanvas.height = rowCount;

  const rasterContext = rasterCanvas.getContext("2d");
  if (!rasterContext) {
    return;
  }

  values.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      rasterContext.fillStyle = Number.isFinite(value)
        ? colorScale(value)
        : "rgba(148, 163, 184, 0.35)";
      rasterContext.fillRect(
        columnIndex,
        rasterCanvas.height - rowIndex - 1,
        1,
        1
      );
    });
  });

  context.imageSmoothingEnabled = false;
  context.drawImage(rasterCanvas, targetX, targetY, targetWidth, targetHeight);
};

const filterTickValuesByPixelDistance = <T,>(
  values: readonly T[],
  readY: (value: T) => number,
  minimumDistancePx: number
) => {
  let lastY = Number.NEGATIVE_INFINITY;

  return values.filter((value) => {
    const y = readY(value);
    if (!Number.isFinite(y) || y - lastY < minimumDistancePx) {
      return false;
    }

    lastY = y;
    return true;
  });
};

const readLatitudeDomainMaxDeg = (latitudeMode: LatitudeDisplayMode) =>
  latitudeMode === LATITUDE_DISPLAY_MODES.MERCATOR_CLAMP
    ? WEB_MERCATOR_MAX_LATITUDE_DEG
    : 90;

const buildLatitudeSamples = (latitudeMode: LatitudeDisplayMode): number[] =>
  buildSteppedRange(
    0,
    readLatitudeDomainMaxDeg(latitudeMode),
    LATITUDE_STEP_DEG
  );

const readLatitudeTickValues = (latitudeMode: LatitudeDisplayMode) => {
  const latitudeDomainMaxDeg = readLatitudeDomainMaxDeg(latitudeMode);
  const baseTicks = [0, 15, 30, 45, 60, 75];

  if (latitudeDomainMaxDeg < 90) {
    return [...baseTicks, latitudeDomainMaxDeg];
  }

  return [...baseTicks, 90];
};

export const readCenterResolutionMetersPerPixel = ({
  rangeM,
  fovDeg,
}: {
  rangeM: Meters;
  fovDeg: number;
}) => {
  const fovVerticalRad = degToRadNumeric(fovDeg) as Radians;
  const tanHalfFov = Math.tan((fovVerticalRad as number) * 0.5);

  if (!Number.isFinite(tanHalfFov) || Math.abs(tanHalfFov) < 1e-9) {
    return NaN;
  }

  const verticalGroundSpanM = 2 * rangeM * tanHalfFov;
  const metersPerCssPixel = verticalGroundSpanM / VIEWPORT_HEIGHT_PX;

  return Number.isFinite(metersPerCssPixel) && metersPerCssPixel > 0
    ? metersPerCssPixel
    : NaN;
};

export const readEffectiveVerticalFovDegFromCenterResolution = ({
  rangeM,
  centerResolutionMPerPx,
}: {
  rangeM: Meters;
  centerResolutionMPerPx: number;
}) => {
  if (
    !Number.isFinite(centerResolutionMPerPx) ||
    centerResolutionMPerPx <= 0 ||
    !Number.isFinite(rangeM) ||
    rangeM <= 0
  ) {
    return NaN;
  }

  const verticalGroundSpanM = centerResolutionMPerPx * VIEWPORT_HEIGHT_PX;
  const tanHalfFov = verticalGroundSpanM / (2 * rangeM);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov < 0) {
    return NaN;
  }

  return (2 * Math.atan(tanHalfFov) * 180) / Math.PI;
};

const readResolutionDomainForRange = (rangeM: Meters) => {
  const minimumResolutionMPerPx = readCenterResolutionMetersPerPixel({
    rangeM,
    fovDeg: MIN_EFFECTIVE_FOV_DEG,
  });
  const maximumResolutionMPerPx = readCenterResolutionMetersPerPixel({
    rangeM,
    fovDeg: 120,
  });

  return {
    minimumResolutionMPerPx,
    maximumResolutionMPerPx,
    minimumLog2Resolution: Math.log2(minimumResolutionMPerPx),
    maximumLog2Resolution: Math.log2(maximumResolutionMPerPx),
  };
};

const buildHeatmapRows = (rangeM: Meters): HeatmapRow[] => {
  const resolutionDomain = readResolutionDomainForRange(rangeM);
  const log2ResolutionSamples = buildSteppedRange(
    resolutionDomain.minimumLog2Resolution,
    resolutionDomain.maximumLog2Resolution,
    HEATMAP_LOG2_RESOLUTION_STEP
  );

  return log2ResolutionSamples.map((log2Resolution) => {
    const resolutionMPerPx = Math.pow(2, log2Resolution);
    return {
      resolutionMPerPx,
      fovDeg: readEffectiveVerticalFovDegFromCenterResolution({
        rangeM,
        centerResolutionMPerPx: resolutionMPerPx,
      }),
    };
  });
};

const buildRangeHeatmapRows = (standardFovDeg: number): RangeHeatmapRow[] => {
  const log2RangeSamples = buildSteppedRange(
    Math.log2(MIN_RANGE_HEATMAP_M),
    Math.log2(MAX_RANGE_HEATMAP_M),
    RANGE_HEATMAP_LOG2_RANGE_STEP
  );

  return log2RangeSamples.map((log2Range) => {
    const rangeM = Math.pow(2, log2Range) as Meters;
    return {
      rangeM,
      centerResolutionMPerPx: readCenterResolutionMetersPerPixel({
        rangeM,
        fovDeg: standardFovDeg,
      }),
    };
  });
};

const buildFovHeatmapSamples = () =>
  buildSteppedRange(MIN_EFFECTIVE_FOV_DEG, 120, FOV_HEATMAP_STEP_DEG);

const buildResolutionTickValues = (rangeM: Meters) => {
  const { minimumResolutionMPerPx, maximumResolutionMPerPx } =
    readResolutionDomainForRange(rangeM);
  const minimumExponent = Math.ceil(Math.log2(minimumResolutionMPerPx));
  const maximumExponent = Math.floor(Math.log2(maximumResolutionMPerPx));
  const tickValues: number[] = [];

  for (
    let exponent = minimumExponent;
    exponent <= maximumExponent;
    exponent += 1
  ) {
    const tickValue = Math.pow(2, exponent);
    if (
      tickValue >= minimumResolutionMPerPx &&
      tickValue <= maximumResolutionMPerPx
    ) {
      tickValues.push(tickValue);
    }
  }

  return tickValues;
};

const buildRangeTickValues = () =>
  INVERSE_RANGES_M.filter(
    (rangeM) => rangeM >= MIN_RANGE_HEATMAP_M && rangeM <= MAX_RANGE_HEATMAP_M
  );

const FOV_AXIS_TICK_CANDIDATES_DEG = [
  120, 90, 60, 45, 30, 20, 10, 5, 2, 1,
] as const;

const buildFovAxisTickValues = (rangeM: Meters) =>
  FOV_AXIS_TICK_CANDIDATES_DEG.filter((fovDeg) => {
    const resolutionMPerPx = readCenterResolutionMetersPerPixel({
      rangeM,
      fovDeg,
    });
    return Number.isFinite(resolutionMPerPx) && resolutionMPerPx > 0;
  });

const formatLatitudeModeLabel = (latitudeMode: LatitudeDisplayMode): string =>
  latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED
    ? "mercator-extreme"
    : "mercator-square";

const readZQuantizeStepValue = (zQuantizeStep: ZQuantizeStep) =>
  Z_QUANTIZE_STEP_VALUES[zQuantizeStep];

const readDisplayZoom = (zoom: number, zQuantizeStep: ZQuantizeStep) => {
  if (!Number.isFinite(zoom)) {
    return NaN;
  }

  const step = readZQuantizeStepValue(zQuantizeStep);
  if (step === null || step <= 0) {
    return zoom;
  }

  return Math.floor((zoom + Number.EPSILON) / step) * step;
};

export const readEffectiveStandardRangeM = ({
  standardRangeCustom,
  standardRangePreset,
}: Pick<
  MercatorZoomStoryArgs,
  "standardRangeCustom" | "standardRangePreset"
>) =>
  (STANDARD_RANGE_PRESET_VALUES_M[standardRangePreset] ??
    standardRangeCustom) as Meters;

const readExtendedMercatorZoomAtLatitude = ({
  baseTileSizePx,
  latitudeDeg,
  rangeM,
  fovDeg,
}: {
  baseTileSizePx: BaseTileSizePx;
  latitudeDeg: number;
  rangeM: Meters;
  fovDeg: number;
}): number => {
  const absoluteLatitudeDeg = Math.abs(latitudeDeg);
  if (absoluteLatitudeDeg >= 90) {
    return NaN;
  }

  const fovVerticalRad = degToRadNumeric(fovDeg) as Radians;
  const tanHalfFov = Math.tan((fovVerticalRad as number) * 0.5);
  const centerRadiusPx = Math.max(VIEWPORT_WIDTH_PX, VIEWPORT_HEIGHT_PX) * 0.5;
  if (
    !Number.isFinite(tanHalfFov) ||
    Math.abs(tanHalfFov) < 1e-9 ||
    !Number.isFinite(centerRadiusPx) ||
    centerRadiusPx <= 0
  ) {
    return NaN;
  }

  const groundRadiusM = rangeM * Math.abs(tanHalfFov);
  const metersPerCssPixel = groundRadiusM / centerRadiusPx;
  if (!Number.isFinite(metersPerCssPixel) || metersPerCssPixel <= 0) {
    return NaN;
  }

  const latitudeRad = degToRadNumeric(absoluteLatitudeDeg) as Radians;
  const mercatorScale = 1 / Math.cos(latitudeRad as number);
  if (!Number.isFinite(mercatorScale) || mercatorScale <= 0) {
    return NaN;
  }

  const denominator = mercatorScale * metersPerCssPixel * baseTileSizePx;
  return denominator > 0 ? Math.log2(EARTH_CIRCUMFERENCE / denominator) : NaN;
};

const readCenterResolutionFromZoomAtLatitude = ({
  baseTileSizePx,
  zoom,
  latitudeDeg,
  latitudeMode,
}: {
  baseTileSizePx: BaseTileSizePx;
  zoom: number;
  latitudeDeg: number;
  latitudeMode: LatitudeDisplayMode;
}): number => {
  if (!Number.isFinite(zoom)) {
    return NaN;
  }

  if (
    latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED &&
    Math.abs(latitudeDeg) > WEB_MERCATOR_MAX_LATITUDE_DEG
  ) {
    const absoluteLatitudeDeg = Math.abs(latitudeDeg);
    if (absoluteLatitudeDeg >= 90) {
      return NaN;
    }

    const latitudeRad = degToRadNumeric(absoluteLatitudeDeg) as Radians;
    const mercatorScale = 1 / Math.cos(latitudeRad as number);
    if (!Number.isFinite(mercatorScale) || mercatorScale <= 0) {
      return NaN;
    }

    return (
      (EARTH_CIRCUMFERENCE /
        (mercatorScale * Math.pow(2, zoom) * baseTileSizePx)) *
      (Math.max(VIEWPORT_WIDTH_PX, VIEWPORT_HEIGHT_PX) / VIEWPORT_HEIGHT_PX)
    );
  }

  if (Math.abs(latitudeDeg) > WEB_MERCATOR_MAX_LATITUDE_DEG) {
    return NaN;
  }

  return (
    metersPerPixel(zoom, latitudeDeg as Degrees, {
      tileSize: baseTileSizePx,
    }) *
    (Math.max(VIEWPORT_WIDTH_PX, VIEWPORT_HEIGHT_PX) / VIEWPORT_HEIGHT_PX)
  );
};

const readZoomAtLatitude = ({
  baseTileSizePx,
  latitudeDeg,
  rangeM,
  fovDeg,
  latitudeMode,
}: {
  baseTileSizePx: BaseTileSizePx;
  latitudeDeg: number;
  rangeM: Meters;
  fovDeg: number;
  latitudeMode: LatitudeDisplayMode;
}): number => {
  if (
    latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED &&
    Math.abs(latitudeDeg) > WEB_MERCATOR_MAX_LATITUDE_DEG
  ) {
    return readExtendedMercatorZoomAtLatitude({
      baseTileSizePx,
      latitudeDeg,
      rangeM,
      fovDeg,
    });
  }

  if (Math.abs(latitudeDeg) > WEB_MERCATOR_MAX_LATITUDE_DEG) {
    return NaN;
  }

  const zoom = mercatorZoomFromDistanceAtLatitudeDeg(
    rangeM,
    latitudeDeg as Degrees,
    {
      fovVerticalRad: degToRadNumeric(fovDeg) as Radians,
      tileSize: baseTileSizePx,
      viewportWidthPx: VIEWPORT_WIDTH_PX,
      viewportHeightPx: VIEWPORT_HEIGHT_PX,
    }
  );

  return typeof zoom === "number" && Number.isFinite(zoom) ? zoom : NaN;
};

const styleAxis = (axisNode: SVGGElement | null) => {
  if (!axisNode) {
    return;
  }

  const axisSelection = select(axisNode);
  axisSelection.selectAll("text").attr("fill", "#334155").attr("font-size", 12);
  axisSelection.selectAll(".domain").attr("stroke", "none");
  axisSelection.selectAll("line").attr("stroke", "rgba(100, 116, 139, 0.78)");
};

const findNearestIndex = (values: readonly number[], target: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  values.forEach((value, index) => {
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const readZoomContourThresholds = (zoomExtent: [number, number]) => {
  const [minZoom, maxZoom] = zoomExtent;
  const zoomSpan = maxZoom - minZoom;

  if (
    !Number.isFinite(minZoom) ||
    !Number.isFinite(maxZoom) ||
    !Number.isFinite(zoomSpan) ||
    zoomSpan <= 0
  ) {
    return [];
  }

  const step = zoomSpan > 12 ? 2 : zoomSpan > 6 ? 1 : zoomSpan > 3 ? 0.5 : 0.25;
  const startZoom = Math.ceil(minZoom / step) * step;
  const endZoom = Math.floor(maxZoom / step) * step;

  return buildSteppedRange(startZoom, endZoom, step).filter(
    (threshold) => threshold > minZoom && threshold < maxZoom
  );
};

export const readRangeFromCenterResolutionAtFov = ({
  centerResolutionMPerPx,
  fovDeg,
}: {
  centerResolutionMPerPx: number;
  fovDeg: number;
}) => {
  const fovVerticalRad = degToRadNumeric(fovDeg) as Radians;
  const tanHalfFov = Math.tan((fovVerticalRad as number) * 0.5);

  if (!Number.isFinite(centerResolutionMPerPx) || centerResolutionMPerPx <= 0) {
    return NaN;
  }

  if (!Number.isFinite(tanHalfFov) || Math.abs(tanHalfFov) < 1e-9) {
    return NaN;
  }

  return (centerResolutionMPerPx * VIEWPORT_HEIGHT_PX) / (2 * tanHalfFov);
};

type MercatorZoomPanelProps = {
  baseTileSizePx: BaseTileSizePx;
  standardRangeM: number;
  standardFovDeg: number;
  standardLatitudeDeg: number;
  latitudeMode: LatitudeDisplayMode;
  zQuantizeStep: ZQuantizeStep;
};

type MercatorZoomHeatmapPanelProps = MercatorZoomPanelProps & {
  showTitle?: boolean;
};

type MercatorZoomRangeHeatmapPanelProps = Pick<
  MercatorZoomPanelProps,
  | "baseTileSizePx"
  | "standardFovDeg"
  | "standardLatitudeDeg"
  | "latitudeMode"
  | "zQuantizeStep"
> & {
  showTitle?: boolean;
};

type MercatorZoomLinePanelProps = Pick<
  MercatorZoomPanelProps,
  | "baseTileSizePx"
  | "standardRangeM"
  | "standardFovDeg"
  | "standardLatitudeDeg"
  | "latitudeMode"
  | "zQuantizeStep"
> & {
  showTitle?: boolean;
};

export const MercatorZoomLatitudeResolutionHeatmap = ({
  baseTileSizePx,
  standardRangeM,
  standardFovDeg,
  standardLatitudeDeg,
  latitudeMode,
  zQuantizeStep,
  showTitle = true,
}: MercatorZoomHeatmapPanelProps) => {
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const fovAxisRef = useRef<SVGGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinnedReadoutIdRef = useRef(0);
  const [hoverReadout, setHoverReadout] = useState<HeatmapReadout | null>(null);
  const [pinnedReadouts, setPinnedReadouts] = useState<PinnedHeatmapReadout[]>(
    []
  );

  const heatmapData = useMemo(() => {
    const latitudeSamples = buildLatitudeSamples(latitudeMode);
    const rows = buildHeatmapRows(standardRangeM as Meters);
    const rawZoomRows = rows.map((row) =>
      latitudeSamples.map((latitudeDeg) =>
        readZoomAtLatitude({
          baseTileSizePx,
          latitudeDeg,
          rangeM: standardRangeM as Meters,
          fovDeg: row.fovDeg,
          latitudeMode,
        })
      )
    );
    const displayZoomRows = rawZoomRows.map((row) =>
      row.map((zoom) => readDisplayZoom(zoom, zQuantizeStep))
    );
    const finiteDisplayZoomValues = displayZoomRows
      .flat()
      .filter(Number.isFinite);
    const displayZoomExtent = extent(finiteDisplayZoomValues) as [
      number,
      number
    ];

    return {
      latitudeSamples,
      rows,
      rawZoomRows,
      displayZoomRows,
      displayZoomExtent,
    };
  }, [baseTileSizePx, latitudeMode, standardRangeM, zQuantizeStep]);

  const innerWidth =
    HEATMAP_OUTER_WIDTH_PX - HEATMAP_MARGIN.left - HEATMAP_MARGIN.right;
  const innerHeight =
    HEATMAP_OUTER_HEIGHT_PX - HEATMAP_MARGIN.top - HEATMAP_MARGIN.bottom;
  const latitudeDomainMaxDeg = readLatitudeDomainMaxDeg(latitudeMode);
  const latitudeTickValues = readLatitudeTickValues(latitudeMode);

  const xScale = useMemo(
    () =>
      scaleLinear().domain([0, latitudeDomainMaxDeg]).range([0, innerWidth]),
    [innerWidth, latitudeDomainMaxDeg]
  );

  const resolutionDomain = useMemo(
    () => readResolutionDomainForRange(standardRangeM as Meters),
    [standardRangeM]
  );
  const yScale = useMemo(
    () =>
      scaleLog()
        .base(2)
        .domain([
          resolutionDomain.minimumResolutionMPerPx,
          resolutionDomain.maximumResolutionMPerPx,
        ])
        .range([innerHeight, 0]),
    [innerHeight, resolutionDomain]
  );

  const colorScale = useMemo(
    () =>
      scaleSequential(interpolateViridis).domain(heatmapData.displayZoomExtent),
    [heatmapData.displayZoomExtent]
  );

  const contourLines = useMemo(() => {
    const thresholds = readZoomContourThresholds(heatmapData.displayZoomExtent);
    const lineGenerator = d3Line<ZoomContourPoint>()
      .x((point) => HEATMAP_MARGIN.left + xScale(point.latitudeDeg))
      .y((point) => HEATMAP_MARGIN.top + yScale(point.resolutionMPerPx))
      .curve(curveLinear);

    return thresholds
      .map((threshold) => {
        const points = heatmapData.latitudeSamples.flatMap((latitudeDeg) => {
          const resolutionMPerPx = readCenterResolutionFromZoomAtLatitude({
            baseTileSizePx,
            zoom: threshold,
            latitudeDeg,
            latitudeMode,
          });

          if (
            !Number.isFinite(resolutionMPerPx) ||
            resolutionMPerPx < resolutionDomain.minimumResolutionMPerPx ||
            resolutionMPerPx > resolutionDomain.maximumResolutionMPerPx
          ) {
            return [];
          }

          return [{ latitudeDeg, resolutionMPerPx }];
        });

        if (points.length < 2 || points[0] === undefined) {
          return null;
        }

        const targetLatitudeDeg =
          readLatitudeDomainMaxDeg(latitudeMode) * (2 / 3);
        const labelPoint =
          points.reduce((best, pt) =>
            Math.abs(pt.latitudeDeg - targetLatitudeDeg) <
            Math.abs(best.latitudeDeg - targetLatitudeDeg)
              ? pt
              : best
          ) ?? points[0];

        return {
          threshold,
          labelPoint,
          path: lineGenerator(points),
        };
      })
      .filter(
        (
          contourLine
        ): contourLine is {
          threshold: number;
          labelPoint: ZoomContourPoint;
          path: string;
        } => contourLine !== null && typeof contourLine.path === "string"
      );
  }, [
    baseTileSizePx,
    heatmapData,
    latitudeMode,
    resolutionDomain,
    xScale,
    yScale,
  ]);

  useEffect(() => {
    const xAxis = axisBottom(xScale)
      .tickValues(latitudeTickValues)
      .tickFormat((value) => formatLatitudeTickValue(Number(value)));
    const resolutionTickValues = filterTickValuesByPixelDistance(
      buildResolutionTickValues(standardRangeM as Meters)
        .slice()
        .reverse(),
      (resolutionMPerPx) => yScale(resolutionMPerPx),
      22
    );
    const fovTickValues = filterTickValuesByPixelDistance(
      buildFovAxisTickValues(standardRangeM as Meters),
      (fovDeg) =>
        yScale(
          readCenterResolutionMetersPerPixel({
            rangeM: standardRangeM as Meters,
            fovDeg,
          })
        ),
      20
    );
    const resolutionAxis = axisLeft(yScale)
      .tickValues(resolutionTickValues)
      .tickFormat((value) => formatResolutionAxisValue(Number(value)));
    const fovAxis = axisLeft(yScale)
      .tickValues(
        fovTickValues.map((fovDeg) =>
          readCenterResolutionMetersPerPixel({
            rangeM: standardRangeM as Meters,
            fovDeg,
          })
        )
      )
      .tickFormat((value) => {
        const equivalentFovDeg =
          readEffectiveVerticalFovDegFromCenterResolution({
            rangeM: standardRangeM as Meters,
            centerResolutionMPerPx: Number(value),
          });

        return Number.isFinite(equivalentFovDeg)
          ? formatDegrees(
              equivalentFovDeg,
              equivalentFovDeg >= 10 ? ".0f" : ".1f"
            )
          : "";
      });

    select(xAxisRef.current).call(xAxis);
    select(yAxisRef.current).call(resolutionAxis);
    select(fovAxisRef.current).call(fovAxis);
    styleAxis(xAxisRef.current);
    styleAxis(yAxisRef.current);
    styleAxis(fovAxisRef.current);
  }, [latitudeTickValues, standardRangeM, xScale, yScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawHeatmapRaster({
      canvas,
      width: canvas.width,
      height: canvas.height,
      columnCount: heatmapData.latitudeSamples.length,
      rowCount: heatmapData.rows.length,
      values: heatmapData.displayZoomRows,
      colorScale,
      targetX: HEATMAP_MARGIN.left,
      targetY: HEATMAP_MARGIN.top,
      targetWidth: innerWidth,
      targetHeight: innerHeight,
    });
  }, [colorScale, heatmapData, innerHeight, innerWidth]);

  const handleHeatmapMove = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(event.clientX - bounds.left, innerWidth)
    );
    const plotY = Math.max(
      0,
      Math.min(event.clientY - bounds.top, innerHeight)
    );

    const latitudeIndex = findNearestIndex(
      heatmapData.latitudeSamples,
      xScale.invert(plotX)
    );
    const rowIndex = findNearestIndex(
      heatmapData.rows.map((row) => row.resolutionMPerPx),
      yScale.invert(plotY)
    );
    const latitudeDeg = heatmapData.latitudeSamples[latitudeIndex];
    const row = heatmapData.rows[rowIndex];
    const rawZoom = heatmapData.rawZoomRows[rowIndex][latitudeIndex];
    const displayZoom = heatmapData.displayZoomRows[rowIndex][latitudeIndex];

    const nextReadout = {
      latitudeDeg,
      fovDeg: row.fovDeg,
      rawZoom,
      displayZoom,
      centerResolutionMPerPx: row.resolutionMPerPx,
      plotX,
      plotY,
    };

    setHoverReadout(nextReadout);
  };

  const handleHeatmapClick = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(event.clientX - bounds.left, innerWidth)
    );
    const plotY = Math.max(
      0,
      Math.min(event.clientY - bounds.top, innerHeight)
    );

    const latitudeIndex = findNearestIndex(
      heatmapData.latitudeSamples,
      xScale.invert(plotX)
    );
    const rowIndex = findNearestIndex(
      heatmapData.rows.map((row) => row.resolutionMPerPx),
      yScale.invert(plotY)
    );
    const latitudeDeg = heatmapData.latitudeSamples[latitudeIndex];
    const row = heatmapData.rows[rowIndex];
    const rawZoom = heatmapData.rawZoomRows[rowIndex][latitudeIndex];
    const displayZoom = heatmapData.displayZoomRows[rowIndex][latitudeIndex];

    pinnedReadoutIdRef.current += 1;
    setPinnedReadouts((current) => [
      ...current,
      {
        id: `latitude-resolution-${pinnedReadoutIdRef.current}`,
        latitudeDeg,
        fovDeg: row.fovDeg,
        rawZoom,
        displayZoom,
        centerResolutionMPerPx: row.resolutionMPerPx,
        plotX,
        plotY,
      },
    ]);
  };

  const readReadoutBox = (readout: HeatmapReadout) =>
    readSampleAnchoredTooltipBox({
      plotX: readout.plotX,
      plotY: readout.plotY,
      width: 132,
      height: 28,
    });

  return (
    <section style={GEO_STORY_STYLES.layout.panel}>
      {showTitle ? (
        <h2 style={GEO_STORY_STYLES.text.panelTitle}>
          {readLatitudeResolutionPlotLabel(standardRangeM)}
        </h2>
      ) : null}
      <svg
        width={HEATMAP_OUTER_WIDTH_PX}
        height={HEATMAP_OUTER_HEIGHT_PX}
        role="img"
        aria-label="Mercator zoom heatmap for latitude and field of view"
        style={{ display: "block" }}
      >
        <foreignObject
          x={0}
          y={0}
          width={HEATMAP_OUTER_WIDTH_PX}
          height={HEATMAP_OUTER_HEIGHT_PX}
        >
          <canvas
            ref={canvasRef}
            width={HEATMAP_OUTER_WIDTH_PX}
            height={HEATMAP_OUTER_HEIGHT_PX}
            style={{ display: "block" }}
          />
        </foreignObject>
        <g
          ref={xAxisRef}
          transform={`translate(${HEATMAP_MARGIN.left}, ${
            HEATMAP_MARGIN.top + innerHeight
          })`}
        />
        <g
          ref={yAxisRef}
          transform={`translate(${HEATMAP_MARGIN.left}, ${HEATMAP_MARGIN.top})`}
        />
        <g
          ref={fovAxisRef}
          transform={`translate(${HEATMAP_MARGIN.left - 68}, ${
            HEATMAP_MARGIN.top
          })`}
        />
        <rect
          x={HEATMAP_MARGIN.left}
          y={HEATMAP_MARGIN.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          style={{ cursor: "none" }}
          onMouseMove={handleHeatmapMove}
          onMouseLeave={() => setHoverReadout(null)}
          onClick={handleHeatmapClick}
        />
        <line
          x1={HEATMAP_MARGIN.left}
          x2={HEATMAP_MARGIN.left + innerWidth}
          y1={
            HEATMAP_MARGIN.top +
            yScale(
              readCenterResolutionMetersPerPixel({
                rangeM: standardRangeM as Meters,
                fovDeg: standardFovDeg,
              })
            )
          }
          y2={
            HEATMAP_MARGIN.top +
            yScale(
              readCenterResolutionMetersPerPixel({
                rangeM: standardRangeM as Meters,
                fovDeg: standardFovDeg,
              })
            )
          }
          stroke="#1d4ed8"
          strokeDasharray="5 5"
          strokeWidth={1.25}
          opacity={0.9}
        />
        {contourLines.map((contourLine) => (
          <path
            key={contourLine.fovDeg}
            d={contourLine.path}
            fill="none"
            stroke="rgba(248, 250, 252, 0.82)"
            strokeWidth={1}
          />
        ))}
        {contourLines.map(
          (contourLine) =>
            contourLine.labelPoint &&
            (() => {
              const labelX =
                HEATMAP_MARGIN.left +
                xScale(contourLine.labelPoint.latitudeDeg) +
                4;
              const labelY =
                HEATMAP_MARGIN.top +
                yScale(contourLine.labelPoint.resolutionMPerPx) +
                18;

              if (
                labelX < HEATMAP_MARGIN.left + 4 ||
                labelX > HEATMAP_MARGIN.left + innerWidth - 24 ||
                labelY < HEATMAP_MARGIN.top + 12 ||
                labelY > HEATMAP_MARGIN.top + innerHeight - 4
              ) {
                return null;
              }

              return (
                <text
                  key={`label-${contourLine.threshold}`}
                  x={labelX}
                  y={labelY}
                  fill="#0f172a"
                  fontSize={11}
                  style={GEO_STORY_STYLES.text.svg}
                >
                  z{d3Format(".3~g")(contourLine.threshold)}
                </text>
              );
            })()
        )}
        <text
          x={HEATMAP_MARGIN.left + 8}
          y={
            HEATMAP_MARGIN.top +
            yScale(
              readCenterResolutionMetersPerPixel({
                rangeM: standardRangeM as Meters,
                fovDeg: standardFovDeg,
              })
            ) -
            8
          }
          style={GEO_STORY_STYLES.text.svg}
        >
          standard fov {formatDegrees(standardFovDeg)}
        </text>
        <VerticalPlotReferenceLine
          x={HEATMAP_MARGIN.left + xScale(standardLatitudeDeg)}
          topY={HEATMAP_MARGIN.top}
          bottomY={HEATMAP_MARGIN.top + innerHeight}
          label={formatDegrees(standardLatitudeDeg)}
          labelY={HEATMAP_MARGIN.top + innerHeight + 18}
        />
        {latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED ? (
          <line
            x1={HEATMAP_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG)}
            x2={HEATMAP_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG)}
            y1={HEATMAP_MARGIN.top}
            y2={HEATMAP_MARGIN.top + innerHeight}
            stroke="#0f172a"
            strokeDasharray="6 6"
            strokeWidth={1.25}
            opacity={0.8}
          />
        ) : null}
        <text
          x={HEATMAP_MARGIN.left + innerWidth * 0.5}
          y={HEATMAP_MARGIN.top + innerHeight + 34}
          textAnchor="middle"
          style={GEO_STORY_STYLES.text.svg}
        >
          latitude
        </text>
        <text
          x={HEATMAP_MARGIN.left - 9}
          y={HEATMAP_MARGIN.top + innerHeight + 34}
          textAnchor="end"
          style={GEO_STORY_STYLES.text.svg}
        >
          m/px
        </text>
        <text
          x={HEATMAP_MARGIN.left - 77}
          y={HEATMAP_MARGIN.top + innerHeight + 34}
          textAnchor="end"
          style={GEO_STORY_STYLES.text.svg}
        >
          fov
        </text>
        {latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED ? (
          <text
            x={HEATMAP_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG) - 8}
            y={HEATMAP_MARGIN.top + 16}
            textAnchor="end"
            style={GEO_STORY_STYLES.text.svg}
          >
            Mercator limit @ {WEB_MERCATOR_MAX_LATITUDE_DEG.toFixed(3)}°
          </text>
        ) : null}
        {pinnedReadouts.map((readout) => {
          const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
            axisLineX: HEATMAP_MARGIN.left,
            text: `${formatDegrees(
              readout.fovDeg,
              readout.fovDeg >= 10 ? ".0f" : ".1f"
            )} · ${formatResolutionAxisValue(readout.centerResolutionMPerPx)}`,
            y: HEATMAP_MARGIN.top + readout.plotY,
            width: HEATMAP_Y_READOUT_WIDTH,
          });
          const xAxisValueLabel = createBottomXAxisReadoutLabel({
            axisLineY: HEATMAP_MARGIN.top + innerHeight,
            text: formatDegrees(readout.latitudeDeg),
            x: HEATMAP_MARGIN.left + readout.plotX,
          });
          const readoutBox = readReadoutBox(readout);

          return (
            <PlotHoverReadoutLayers
              key={readout.id}
              readoutKey={readout.id}
              plotLeft={HEATMAP_MARGIN.left}
              plotTop={HEATMAP_MARGIN.top}
              innerWidth={innerWidth}
              innerHeight={innerHeight}
              plotX={readout.plotX}
              plotY={readout.plotY}
              showGuides
              guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                yAxisValueLabel
              )}
              guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                xAxisValueLabel
              )}
              axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
              tooltip={{
                x: HEATMAP_MARGIN.left + readoutBox.x,
                y: HEATMAP_MARGIN.top + readoutBox.y,
                width: readoutBox.width,
                height: readoutBox.height,
                anchorAttach: "left",
                anchorAtSemicircleCenter: true,
                onClose: () =>
                  setPinnedReadouts((current) =>
                    current.filter((entry) => entry.id !== readout.id)
                  ),
                children: <span>{d3Format(".2f")(readout.displayZoom)}</span>,
              }}
            />
          );
        })}
        {hoverReadout
          ? (() => {
              const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
                axisLineX: HEATMAP_MARGIN.left,
                text: `${formatDegrees(
                  hoverReadout.fovDeg,
                  hoverReadout.fovDeg >= 10 ? ".0f" : ".1f"
                )} · ${formatResolutionAxisValue(
                  hoverReadout.centerResolutionMPerPx
                )}`,
                y: HEATMAP_MARGIN.top + hoverReadout.plotY,
                width: HEATMAP_Y_READOUT_WIDTH,
              });
              const xAxisValueLabel = createBottomXAxisReadoutLabel({
                axisLineY: HEATMAP_MARGIN.top + innerHeight,
                text: formatDegrees(hoverReadout.latitudeDeg),
                x: HEATMAP_MARGIN.left + hoverReadout.plotX,
              });
              const readoutBox = readReadoutBox(hoverReadout);

              return (
                <PlotHoverReadoutLayers
                  plotLeft={HEATMAP_MARGIN.left}
                  plotTop={HEATMAP_MARGIN.top}
                  innerWidth={innerWidth}
                  innerHeight={innerHeight}
                  plotX={hoverReadout.plotX}
                  plotY={hoverReadout.plotY}
                  showGuides
                  guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                    yAxisValueLabel
                  )}
                  guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                    xAxisValueLabel
                  )}
                  axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
                  tooltip={{
                    x: HEATMAP_MARGIN.left + readoutBox.x,
                    y: HEATMAP_MARGIN.top + readoutBox.y,
                    width: readoutBox.width,
                    height: readoutBox.height,
                    anchorAttach: "left",
                    anchorAtSemicircleCenter: true,
                    children: (
                      <span>{d3Format(".2f")(hoverReadout.displayZoom)}</span>
                    ),
                  }}
                />
              );
            })()
          : null}
      </svg>
    </section>
  );
};

export const MercatorZoomLatitudeRangeHeatmap = ({
  baseTileSizePx,
  standardFovDeg,
  standardLatitudeDeg,
  latitudeMode,
  zQuantizeStep,
  showTitle = true,
}: MercatorZoomRangeHeatmapPanelProps) => {
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinnedReadoutIdRef = useRef(0);
  const [hoverReadout, setHoverReadout] = useState<HeatmapReadout | null>(null);
  const [pinnedReadouts, setPinnedReadouts] = useState<PinnedHeatmapReadout[]>(
    []
  );

  const heatmapData = useMemo(() => {
    const latitudeSamples = buildLatitudeSamples(latitudeMode);
    const rows = buildRangeHeatmapRows(standardFovDeg);
    const rawZoomRows = rows.map((row) =>
      latitudeSamples.map((latitudeDeg) =>
        readZoomAtLatitude({
          baseTileSizePx,
          latitudeDeg,
          rangeM: row.rangeM,
          fovDeg: standardFovDeg,
          latitudeMode,
        })
      )
    );
    const displayZoomRows = rawZoomRows.map((row) =>
      row.map((zoom) => readDisplayZoom(zoom, zQuantizeStep))
    );
    const finiteDisplayZoomValues = displayZoomRows
      .flat()
      .filter(Number.isFinite);
    const displayZoomExtent = extent(finiteDisplayZoomValues) as [
      number,
      number
    ];

    return {
      latitudeSamples,
      rows,
      rawZoomRows,
      displayZoomRows,
      displayZoomExtent,
    };
  }, [baseTileSizePx, latitudeMode, standardFovDeg, zQuantizeStep]);

  const innerWidth =
    RANGE_HEATMAP_OUTER_WIDTH_PX -
    RANGE_HEATMAP_MARGIN.left -
    RANGE_HEATMAP_MARGIN.right;
  const innerHeight =
    RANGE_HEATMAP_OUTER_HEIGHT_PX -
    RANGE_HEATMAP_MARGIN.top -
    RANGE_HEATMAP_MARGIN.bottom;
  const latitudeDomainMaxDeg = readLatitudeDomainMaxDeg(latitudeMode);
  const latitudeTickValues = readLatitudeTickValues(latitudeMode);

  const xScale = useMemo(
    () =>
      scaleLinear().domain([0, latitudeDomainMaxDeg]).range([0, innerWidth]),
    [innerWidth, latitudeDomainMaxDeg]
  );

  const yScale = useMemo(
    () =>
      scaleLog()
        .base(2)
        .domain([MIN_RANGE_HEATMAP_M, MAX_RANGE_HEATMAP_M])
        .range([innerHeight, 0]),
    [innerHeight]
  );

  const colorScale = useMemo(
    () =>
      scaleSequential(interpolateViridis).domain(heatmapData.displayZoomExtent),
    [heatmapData.displayZoomExtent]
  );

  const contourLines = useMemo(() => {
    const thresholds = readZoomContourThresholds(heatmapData.displayZoomExtent);
    const lineGenerator = d3Line<RangeContourPoint>()
      .x((point) => RANGE_HEATMAP_MARGIN.left + xScale(point.latitudeDeg))
      .y((point) => RANGE_HEATMAP_MARGIN.top + yScale(point.rangeM))
      .curve(curveLinear);

    return thresholds
      .map((threshold) => {
        const points = heatmapData.latitudeSamples.flatMap((latitudeDeg) => {
          const centerResolutionMPerPx = readCenterResolutionFromZoomAtLatitude(
            {
              baseTileSizePx,
              zoom: threshold,
              latitudeDeg,
              latitudeMode,
            }
          );
          const rangeM = readRangeFromCenterResolutionAtFov({
            centerResolutionMPerPx,
            fovDeg: standardFovDeg,
          });

          if (
            !Number.isFinite(rangeM) ||
            rangeM < MIN_RANGE_HEATMAP_M ||
            rangeM > MAX_RANGE_HEATMAP_M
          ) {
            return [];
          }

          return [{ latitudeDeg, rangeM }];
        });

        if (points.length < 2 || points[0] === undefined) {
          return null;
        }

        const targetLatitudeDeg =
          readLatitudeDomainMaxDeg(latitudeMode) * (2 / 3);
        const labelPoint =
          points.reduce((best, pt) =>
            Math.abs(pt.latitudeDeg - targetLatitudeDeg) <
            Math.abs(best.latitudeDeg - targetLatitudeDeg)
              ? pt
              : best
          ) ?? points[0];

        return {
          threshold,
          labelPoint,
          path: lineGenerator(points),
        };
      })
      .filter(
        (
          contourLine
        ): contourLine is {
          threshold: number;
          labelPoint: RangeContourPoint;
          path: string;
        } => contourLine !== null && typeof contourLine.path === "string"
      );
  }, [
    baseTileSizePx,
    heatmapData.displayZoomExtent,
    heatmapData.latitudeSamples,
    latitudeMode,
    standardFovDeg,
    xScale,
    yScale,
  ]);

  useEffect(() => {
    const xAxis = axisBottom(xScale)
      .tickValues(latitudeTickValues)
      .tickFormat((value) => formatLatitudeTickValue(Number(value)));
    const yAxis = axisLeft(yScale)
      .tickValues(buildRangeTickValues())
      .tickFormat((value) => formatRangeM(Number(value)));

    select(xAxisRef.current).call(xAxis);
    select(yAxisRef.current).call(yAxis);
    styleAxis(xAxisRef.current);
    styleAxis(yAxisRef.current);
  }, [latitudeTickValues, xScale, yScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawHeatmapRaster({
      canvas,
      width: canvas.width,
      height: canvas.height,
      columnCount: heatmapData.latitudeSamples.length,
      rowCount: heatmapData.rows.length,
      values: heatmapData.displayZoomRows,
      colorScale,
      targetX: RANGE_HEATMAP_MARGIN.left,
      targetY: RANGE_HEATMAP_MARGIN.top,
      targetWidth: innerWidth,
      targetHeight: innerHeight,
    });
  }, [colorScale, heatmapData, innerHeight, innerWidth]);

  const handleHeatmapMove = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(event.clientX - bounds.left, innerWidth)
    );
    const plotY = Math.max(
      0,
      Math.min(event.clientY - bounds.top, innerHeight)
    );

    const latitudeIndex = findNearestIndex(
      heatmapData.latitudeSamples,
      xScale.invert(plotX)
    );
    const rowIndex = findNearestIndex(
      heatmapData.rows.map((row) => row.rangeM),
      yScale.invert(plotY)
    );
    const latitudeDeg = heatmapData.latitudeSamples[latitudeIndex];
    const row = heatmapData.rows[rowIndex];
    const rawZoom = heatmapData.rawZoomRows[rowIndex][latitudeIndex];
    const displayZoom = heatmapData.displayZoomRows[rowIndex][latitudeIndex];

    const nextReadout = {
      latitudeDeg,
      rangeM: row.rangeM,
      fovDeg: standardFovDeg,
      rawZoom,
      displayZoom,
      centerResolutionMPerPx: row.centerResolutionMPerPx,
      plotX,
      plotY,
    };

    setHoverReadout(nextReadout);
  };

  const handleHeatmapClick = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(event.clientX - bounds.left, innerWidth)
    );
    const plotY = Math.max(
      0,
      Math.min(event.clientY - bounds.top, innerHeight)
    );

    const latitudeIndex = findNearestIndex(
      heatmapData.latitudeSamples,
      xScale.invert(plotX)
    );
    const rowIndex = findNearestIndex(
      heatmapData.rows.map((row) => row.rangeM),
      yScale.invert(plotY)
    );
    const latitudeDeg = heatmapData.latitudeSamples[latitudeIndex];
    const row = heatmapData.rows[rowIndex];
    const rawZoom = heatmapData.rawZoomRows[rowIndex][latitudeIndex];
    const displayZoom = heatmapData.displayZoomRows[rowIndex][latitudeIndex];

    pinnedReadoutIdRef.current += 1;
    setPinnedReadouts((current) => [
      ...current,
      {
        id: `latitude-range-${pinnedReadoutIdRef.current}`,
        latitudeDeg,
        rangeM: row.rangeM,
        fovDeg: standardFovDeg,
        rawZoom,
        displayZoom,
        centerResolutionMPerPx: row.centerResolutionMPerPx,
        plotX,
        plotY,
      },
    ]);
  };

  const readReadoutBox = (readout: HeatmapReadout) =>
    readSampleAnchoredTooltipBox({
      plotX: readout.plotX,
      plotY: readout.plotY,
      width: 154,
      height: 46,
    });

  return (
    <section style={GEO_STORY_STYLES.layout.panel}>
      {showTitle ? (
        <h2 style={GEO_STORY_STYLES.text.panelTitle}>
          {readLatitudeRangePlotLabel(standardFovDeg)}
        </h2>
      ) : null}
      <svg
        width={RANGE_HEATMAP_OUTER_WIDTH_PX}
        height={RANGE_HEATMAP_OUTER_HEIGHT_PX}
        role="img"
        aria-label="Mercator zoom heatmap for latitude and range at fixed fov"
        style={{ display: "block" }}
      >
        <foreignObject
          x={0}
          y={0}
          width={RANGE_HEATMAP_OUTER_WIDTH_PX}
          height={RANGE_HEATMAP_OUTER_HEIGHT_PX}
        >
          <canvas
            ref={canvasRef}
            width={RANGE_HEATMAP_OUTER_WIDTH_PX}
            height={RANGE_HEATMAP_OUTER_HEIGHT_PX}
            style={{ display: "block" }}
          />
        </foreignObject>
        <g
          ref={xAxisRef}
          transform={`translate(${RANGE_HEATMAP_MARGIN.left}, ${
            RANGE_HEATMAP_MARGIN.top + innerHeight
          })`}
        />
        <g
          ref={yAxisRef}
          transform={`translate(${RANGE_HEATMAP_MARGIN.left}, ${RANGE_HEATMAP_MARGIN.top})`}
        />
        <rect
          x={RANGE_HEATMAP_MARGIN.left}
          y={RANGE_HEATMAP_MARGIN.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          style={{ cursor: "none" }}
          onMouseMove={handleHeatmapMove}
          onMouseLeave={() => setHoverReadout(null)}
          onClick={handleHeatmapClick}
        />
        {contourLines.map((contourLine) => (
          <path
            key={contourLine.fovDeg}
            d={contourLine.path}
            fill="none"
            stroke="rgba(248, 250, 252, 0.82)"
            strokeWidth={1}
          />
        ))}
        {contourLines.map((contourLine) => {
          const labelX =
            RANGE_HEATMAP_MARGIN.left +
            xScale(contourLine.labelPoint.latitudeDeg) +
            4;
          const labelY =
            RANGE_HEATMAP_MARGIN.top +
            yScale(contourLine.labelPoint.rangeM) +
            18;

          if (
            labelX < RANGE_HEATMAP_MARGIN.left + 4 ||
            labelX > RANGE_HEATMAP_MARGIN.left + innerWidth - 24 ||
            labelY < RANGE_HEATMAP_MARGIN.top + 12 ||
            labelY > RANGE_HEATMAP_MARGIN.top + innerHeight - 4
          ) {
            return null;
          }

          return (
            <text
              key={`range-label-${contourLine.threshold}`}
              x={labelX}
              y={labelY}
              fill="#0f172a"
              fontSize={11}
              style={GEO_STORY_STYLES.text.svg}
            >
              z{d3Format(".3~g")(contourLine.threshold)}
            </text>
          );
        })}
        <VerticalPlotReferenceLine
          x={RANGE_HEATMAP_MARGIN.left + xScale(standardLatitudeDeg)}
          topY={RANGE_HEATMAP_MARGIN.top}
          bottomY={RANGE_HEATMAP_MARGIN.top + innerHeight}
          label={formatDegrees(standardLatitudeDeg)}
          labelY={RANGE_HEATMAP_MARGIN.top + innerHeight + 18}
        />
        {latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED ? (
          <line
            x1={
              RANGE_HEATMAP_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG)
            }
            x2={
              RANGE_HEATMAP_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG)
            }
            y1={RANGE_HEATMAP_MARGIN.top}
            y2={RANGE_HEATMAP_MARGIN.top + innerHeight}
            stroke="#0f172a"
            strokeDasharray="6 6"
            strokeWidth={1.25}
            opacity={0.8}
          />
        ) : null}
        <text
          x={RANGE_HEATMAP_MARGIN.left + innerWidth * 0.5}
          y={RANGE_HEATMAP_MARGIN.top + innerHeight + 34}
          textAnchor="middle"
          style={GEO_STORY_STYLES.text.svg}
        >
          latitude
        </text>
        <text
          x={readPrimaryYAxisTitleX(RANGE_HEATMAP_MARGIN.left)}
          y={RANGE_HEATMAP_MARGIN.top + innerHeight * 0.5}
          textAnchor="middle"
          transform={`rotate(-90 ${readPrimaryYAxisTitleX(
            RANGE_HEATMAP_MARGIN.left
          )} ${RANGE_HEATMAP_MARGIN.top + innerHeight * 0.5})`}
          style={GEO_STORY_STYLES.text.svg}
        >
          range
        </text>
        {pinnedReadouts.map((readout) => {
          const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
            axisLineX: RANGE_HEATMAP_MARGIN.left,
            text: formatRangeM(readout.rangeM ?? Number.NaN),
            y: RANGE_HEATMAP_MARGIN.top + readout.plotY,
            width: RANGE_HEATMAP_Y_READOUT_WIDTH,
          });
          const xAxisValueLabel = createBottomXAxisReadoutLabel({
            axisLineY: RANGE_HEATMAP_MARGIN.top + innerHeight,
            text: formatDegrees(readout.latitudeDeg),
            x: RANGE_HEATMAP_MARGIN.left + readout.plotX,
          });
          const readoutBox = readReadoutBox(readout);

          return (
            <PlotHoverReadoutLayers
              key={readout.id}
              readoutKey={readout.id}
              plotLeft={RANGE_HEATMAP_MARGIN.left}
              plotTop={RANGE_HEATMAP_MARGIN.top}
              innerWidth={innerWidth}
              innerHeight={innerHeight}
              plotX={readout.plotX}
              plotY={readout.plotY}
              showGuides
              guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                yAxisValueLabel
              )}
              guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                xAxisValueLabel
              )}
              axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
              tooltip={{
                x: RANGE_HEATMAP_MARGIN.left + readoutBox.x,
                y: RANGE_HEATMAP_MARGIN.top + readoutBox.y,
                width: readoutBox.width,
                height: readoutBox.height,
                anchorAttach: "left",
                anchorAtSemicircleCenter: true,
                onClose: () =>
                  setPinnedReadouts((current) =>
                    current.filter((entry) => entry.id !== readout.id)
                  ),
                children: <span>{d3Format(".2f")(readout.displayZoom)}</span>,
              }}
            />
          );
        })}
        {hoverReadout
          ? (() => {
              const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
                axisLineX: RANGE_HEATMAP_MARGIN.left,
                text: formatRangeM(hoverReadout.rangeM ?? Number.NaN),
                y: RANGE_HEATMAP_MARGIN.top + hoverReadout.plotY,
                width: RANGE_HEATMAP_Y_READOUT_WIDTH,
              });
              const xAxisValueLabel = createBottomXAxisReadoutLabel({
                axisLineY: RANGE_HEATMAP_MARGIN.top + innerHeight,
                text: formatDegrees(hoverReadout.latitudeDeg),
                x: RANGE_HEATMAP_MARGIN.left + hoverReadout.plotX,
              });
              const readoutBox = readReadoutBox(hoverReadout);

              return (
                <PlotHoverReadoutLayers
                  plotLeft={RANGE_HEATMAP_MARGIN.left}
                  plotTop={RANGE_HEATMAP_MARGIN.top}
                  innerWidth={innerWidth}
                  innerHeight={innerHeight}
                  plotX={hoverReadout.plotX}
                  plotY={hoverReadout.plotY}
                  showGuides
                  guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                    yAxisValueLabel
                  )}
                  guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                    xAxisValueLabel
                  )}
                  axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
                  tooltip={{
                    x: RANGE_HEATMAP_MARGIN.left + readoutBox.x,
                    y: RANGE_HEATMAP_MARGIN.top + readoutBox.y,
                    width: readoutBox.width,
                    height: readoutBox.height,
                    anchorAttach: "left",
                    anchorAtSemicircleCenter: true,
                    children: (
                      <span>{d3Format(".2f")(hoverReadout.displayZoom)}</span>
                    ),
                  }}
                />
              );
            })()
          : null}
      </svg>
    </section>
  );
};

export const MercatorZoomLatitudeLinePlot = ({
  baseTileSizePx,
  standardRangeM,
  standardFovDeg,
  standardLatitudeDeg,
  latitudeMode,
  zQuantizeStep,
  showTitle = true,
}: MercatorZoomLinePanelProps) => {
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const pinnedReadoutIdRef = useRef(0);
  const [hoverReadout, setHoverReadout] = useState<LineReadout | null>(null);
  const [pinnedReadouts, setPinnedReadouts] = useState<PinnedLineReadout[]>([]);

  const linePoints = useMemo<ZoomLinePoint[]>(
    () =>
      buildLatitudeSamples(latitudeMode).map((latitudeDeg) => ({
        latitudeDeg,
        rawZoom: readZoomAtLatitude({
          baseTileSizePx,
          latitudeDeg,
          rangeM: standardRangeM as Meters,
          fovDeg: standardFovDeg,
          latitudeMode,
        }),
        displayZoom: readDisplayZoom(
          readZoomAtLatitude({
            baseTileSizePx,
            latitudeDeg,
            rangeM: standardRangeM as Meters,
            fovDeg: standardFovDeg,
            latitudeMode,
          }),
          zQuantizeStep
        ),
      })),
    [
      baseTileSizePx,
      latitudeMode,
      standardFovDeg,
      standardRangeM,
      zQuantizeStep,
    ]
  );

  const zoomExtent = useMemo(() => {
    const finiteZoomValues = linePoints
      .map((point) => point.displayZoom)
      .filter(Number.isFinite);
    const [minZoom, maxZoom] = extent(finiteZoomValues) as [number, number];
    const padding = Math.max(0.15, (maxZoom - minZoom) * 0.06);

    return [minZoom - padding, maxZoom + padding] as [number, number];
  }, [linePoints]);

  const innerWidth = LINE_OUTER_WIDTH_PX - LINE_MARGIN.left - LINE_MARGIN.right;
  const innerHeight =
    LINE_OUTER_HEIGHT_PX - LINE_MARGIN.top - LINE_MARGIN.bottom;
  const latitudeDomainMaxDeg = readLatitudeDomainMaxDeg(latitudeMode);
  const latitudeTickValues = readLatitudeTickValues(latitudeMode);

  const xScale = useMemo(
    () =>
      scaleLinear().domain([0, latitudeDomainMaxDeg]).range([0, innerWidth]),
    [innerWidth, latitudeDomainMaxDeg]
  );

  const yScale = useMemo(
    () => scaleLinear().domain(zoomExtent).range([innerHeight, 0]).nice(),
    [innerHeight, zoomExtent]
  );

  const linePath = useMemo(() => {
    const generator = d3Line<ZoomLinePoint>()
      .defined((point) => Number.isFinite(point.displayZoom))
      .x((point) => xScale(point.latitudeDeg))
      .y((point) => yScale(point.displayZoom))
      .curve(
        readZQuantizeStepValue(zQuantizeStep) === null
          ? curveLinear
          : curveStepAfter
      );

    return generator(linePoints) ?? "";
  }, [linePoints, xScale, yScale, zQuantizeStep]);

  useEffect(() => {
    const xAxis = axisBottom(xScale)
      .tickValues(latitudeTickValues)
      .tickFormat((value) => formatLatitudeTickValue(Number(value)));
    const yAxis = axisLeft(yScale).ticks(8).tickFormat(d3Format(".2f"));

    select(xAxisRef.current).call(xAxis);
    select(yAxisRef.current).call(yAxis);
    styleAxis(xAxisRef.current);
    styleAxis(yAxisRef.current);
  }, [latitudeTickValues, xScale, yScale]);

  const finiteLinePoints = useMemo(
    () =>
      linePoints.filter(
        (point) =>
          Number.isFinite(point.latitudeDeg) &&
          Number.isFinite(point.rawZoom) &&
          Number.isFinite(point.displayZoom)
      ),
    [linePoints]
  );

  const resolveLineReadoutAtPlotX = (plotX: number): LineReadout | null => {
    const firstPoint = finiteLinePoints[0];
    const lastPoint = finiteLinePoints[finiteLinePoints.length - 1];

    if (firstPoint === undefined || lastPoint === undefined) {
      return null;
    }

    const clampedPlotX = Math.max(0, Math.min(plotX, innerWidth));
    const stepMode = readZQuantizeStepValue(zQuantizeStep) !== null;

    if (finiteLinePoints.length === 1) {
      return {
        latitudeDeg: firstPoint.latitudeDeg,
        rawZoom: firstPoint.rawZoom,
        displayZoom: firstPoint.displayZoom,
        plotX: xScale(firstPoint.latitudeDeg),
        plotY: yScale(firstPoint.displayZoom),
      };
    }

    for (let index = 0; index < finiteLinePoints.length - 1; index += 1) {
      const startPoint = finiteLinePoints[index];
      const endPoint = finiteLinePoints[index + 1];

      if (startPoint === undefined || endPoint === undefined) {
        continue;
      }

      const startX = xScale(startPoint.latitudeDeg);
      const endX = xScale(endPoint.latitudeDeg);

      if (
        clampedPlotX < Math.min(startX, endX) ||
        clampedPlotX > Math.max(startX, endX)
      ) {
        continue;
      }

      const segmentWidth = Math.max(Math.abs(endX - startX), 1e-9);
      const t = Math.max(
        0,
        Math.min(1, Math.abs(clampedPlotX - startX) / segmentWidth)
      );
      const latitudeDeg = xScale.invert(clampedPlotX);
      const rawZoom =
        startPoint.rawZoom + (endPoint.rawZoom - startPoint.rawZoom) * t;
      const displayZoom = stepMode
        ? startPoint.displayZoom
        : startPoint.displayZoom +
          (endPoint.displayZoom - startPoint.displayZoom) * t;

      return {
        latitudeDeg,
        rawZoom,
        displayZoom,
        plotX: clampedPlotX,
        plotY: yScale(displayZoom),
      };
    }

    const edgePoint =
      clampedPlotX <= xScale(firstPoint.latitudeDeg) ? firstPoint : lastPoint;

    return {
      latitudeDeg: edgePoint.latitudeDeg,
      rawZoom: edgePoint.rawZoom,
      displayZoom: edgePoint.displayZoom,
      plotX: xScale(edgePoint.latitudeDeg),
      plotY: yScale(edgePoint.displayZoom),
    };
  };

  const readLinePlotPosition = (event: ReactMouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left - LINE_MARGIN.left;
    const localY = event.clientY - bounds.top - LINE_MARGIN.top;

    if (
      localX < 0 ||
      localX > innerWidth ||
      localY < 0 ||
      localY > innerHeight
    ) {
      return null;
    }

    return { localX, localY };
  };

  const handleLineMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const position = readLinePlotPosition(event);

    if (!position) {
      setHoverReadout(null);
      return;
    }

    const localX = Math.max(0, Math.min(position.localX, innerWidth));
    setHoverReadout(resolveLineReadoutAtPlotX(localX));
  };

  const handleLineClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const position = readLinePlotPosition(event);

    if (!position) {
      return;
    }

    const localX = Math.max(0, Math.min(position.localX, innerWidth));
    const readout = resolveLineReadoutAtPlotX(localX);

    if (!readout) {
      return;
    }

    pinnedReadoutIdRef.current += 1;
    setPinnedReadouts((current) => [
      ...current,
      {
        ...readout,
        id: `latitude-line-${pinnedReadoutIdRef.current}`,
      },
    ]);
  };

  const readReadoutBox = (readout: LineReadout) =>
    readSampleAnchoredTooltipBox({
      plotX: readout.plotX,
      plotY: readout.plotY,
      width: 132,
      height: 28,
    });

  return (
    <section style={GEO_STORY_STYLES.layout.panel}>
      {showTitle ? (
        <h2 style={GEO_STORY_STYLES.text.panelTitle}>
          {readLatitudePlotLabel(standardRangeM, standardFovDeg)}
        </h2>
      ) : null}
      <svg
        width={LINE_OUTER_WIDTH_PX}
        height={LINE_OUTER_HEIGHT_PX}
        role="img"
        aria-label="Mercator zoom over latitude"
        style={{ display: "block" }}
        onMouseMove={handleLineMove}
        onMouseLeave={() => setHoverReadout(null)}
        onClick={handleLineClick}
      >
        <g
          ref={xAxisRef}
          transform={`translate(${LINE_MARGIN.left}, ${
            LINE_MARGIN.top + innerHeight
          })`}
        />
        <g
          ref={yAxisRef}
          transform={`translate(${LINE_MARGIN.left}, ${LINE_MARGIN.top})`}
        />
        <rect
          x={LINE_MARGIN.left}
          y={LINE_MARGIN.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          style={{ cursor: "none" }}
        />
        {latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED ? (
          <line
            x1={LINE_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG)}
            x2={LINE_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG)}
            y1={LINE_MARGIN.top}
            y2={LINE_MARGIN.top + innerHeight}
            stroke="#64748b"
            strokeDasharray="6 6"
            strokeWidth={1}
          />
        ) : null}
        <VerticalPlotReferenceLine
          x={LINE_MARGIN.left + xScale(standardLatitudeDeg)}
          topY={LINE_MARGIN.top}
          bottomY={LINE_MARGIN.top + innerHeight}
          label={`${d3Format(".1f")(standardLatitudeDeg)}°`}
          labelY={LINE_MARGIN.top + innerHeight + 18}
        />
        <path
          d={linePath}
          transform={`translate(${LINE_MARGIN.left}, ${LINE_MARGIN.top})`}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pinnedReadouts.map((readout) => {
          const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
            axisLineX: LINE_MARGIN.left,
            text: d3Format(".2f")(readout.displayZoom),
            y: LINE_MARGIN.top + readout.plotY,
            width: LINE_Y_READOUT_WIDTH,
          });
          const xAxisValueLabel = createBottomXAxisReadoutLabel({
            axisLineY: LINE_MARGIN.top + innerHeight,
            text: formatDegrees(readout.latitudeDeg),
            x: LINE_MARGIN.left + readout.plotX,
          });
          const readoutBox = readReadoutBox(readout);

          return (
            <PlotHoverReadoutLayers
              key={readout.id}
              readoutKey={readout.id}
              plotLeft={LINE_MARGIN.left}
              plotTop={LINE_MARGIN.top}
              innerWidth={innerWidth}
              innerHeight={innerHeight}
              plotX={readout.plotX}
              plotY={readout.plotY}
              showGuides
              guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                yAxisValueLabel
              )}
              guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                xAxisValueLabel
              )}
              axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
              tooltip={{
                x: LINE_MARGIN.left + readoutBox.x,
                y: LINE_MARGIN.top + readoutBox.y,
                width: readoutBox.width,
                height: readoutBox.height,
                anchorAttach: "left",
                anchorAtSemicircleCenter: true,
                onClose: () =>
                  setPinnedReadouts((current) =>
                    current.filter((entry) => entry.id !== readout.id)
                  ),
                children: <span>{d3Format(".2f")(readout.displayZoom)}</span>,
              }}
            />
          );
        })}
        {hoverReadout
          ? (() => {
              const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
                axisLineX: LINE_MARGIN.left,
                text: d3Format(".2f")(hoverReadout.displayZoom),
                y: LINE_MARGIN.top + hoverReadout.plotY,
                width: LINE_Y_READOUT_WIDTH,
              });
              const xAxisValueLabel = createBottomXAxisReadoutLabel({
                axisLineY: LINE_MARGIN.top + innerHeight,
                text: formatDegrees(hoverReadout.latitudeDeg),
                x: LINE_MARGIN.left + hoverReadout.plotX,
              });
              const readoutBox = readReadoutBox(hoverReadout);

              return (
                <PlotHoverReadoutLayers
                  plotLeft={LINE_MARGIN.left}
                  plotTop={LINE_MARGIN.top}
                  innerWidth={innerWidth}
                  innerHeight={innerHeight}
                  plotX={hoverReadout.plotX}
                  plotY={hoverReadout.plotY}
                  showGuides
                  guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                    yAxisValueLabel
                  )}
                  guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                    xAxisValueLabel
                  )}
                  axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
                  tooltip={{
                    x: LINE_MARGIN.left + readoutBox.x,
                    y: LINE_MARGIN.top + readoutBox.y,
                    width: readoutBox.width,
                    height: readoutBox.height,
                    anchorAttach: "left",
                    anchorAtSemicircleCenter: true,
                    children: (
                      <span>{d3Format(".2f")(hoverReadout.displayZoom)}</span>
                    ),
                  }}
                />
              );
            })()
          : null}
        <text
          x={LINE_MARGIN.left + innerWidth * 0.5}
          y={LINE_MARGIN.top + innerHeight + 34}
          textAnchor="middle"
          style={GEO_STORY_STYLES.text.svg}
        >
          latitude
        </text>
        <text
          transform={`translate(${readPrimaryYAxisTitleX(LINE_MARGIN.left)} ${
            LINE_MARGIN.top + innerHeight * 0.5
          }) rotate(-90)`}
          textAnchor="middle"
          style={GEO_STORY_STYLES.text.svg}
        >
          zoom
        </text>
        {latitudeMode === LATITUDE_DISPLAY_MODES.CESIUM_EXTENDED ? (
          <text
            x={LINE_MARGIN.left + xScale(WEB_MERCATOR_MAX_LATITUDE_DEG) - 8}
            y={LINE_MARGIN.top + 16}
            textAnchor="end"
            style={GEO_STORY_STYLES.text.svg}
          >
            Mercator limit @ {WEB_MERCATOR_MAX_LATITUDE_DEG.toFixed(3)}°
          </text>
        ) : null}
      </svg>
    </section>
  );
};

const INVERSE_RANGES_M: Meters[] = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000,
] as Meters[];

export const MercatorZoomPlots = ({
  baseTileSizePx,
  standardRangePreset,
  standardRangeCustom,
  standardFovDeg,
  standardLatitudeDeg,
  latitudeMode,
  zQuantizeStep,
}: MercatorZoomStoryArgs) => {
  const effectiveStandardRangeM = useMemo(
    () =>
      readEffectiveStandardRangeM({
        standardRangeCustom,
        standardRangePreset,
      }),
    [standardRangeCustom, standardRangePreset]
  );
  const statusValues = useMemo(
    () => [
      `range ${d3Format(".0f")(effectiveStandardRangeM)} m`,
      `fov ${formatDegrees(standardFovDeg)}`,
      `lat ${formatDegrees(standardLatitudeDeg)}`,
      `mode ${formatLatitudeModeLabel(latitudeMode)}`,
      `tile ${baseTileSizePx}px`,
      `z ${zQuantizeStep}`,
    ],
    [
      effectiveStandardRangeM,
      baseTileSizePx,
      latitudeMode,
      standardFovDeg,
      standardLatitudeDeg,
      zQuantizeStep,
    ]
  );

  return (
    <GeoChartStoryFrame label="Zoom by Latitude Overview" values={statusValues}>
      <section style={GEO_STORY_STYLES.layout.intro}>
        <p style={GEO_STORY_STYLES.text.introText}>
          This story uses{" "}
          <a
            href="https://en.wikipedia.org/wiki/Web_Mercator_projection"
            rel="noreferrer"
            style={GEO_STORY_STYLES.text.link}
            target="_blank"
          >
            Web Mercator
          </a>{" "}
          zoom-equivalence helpers from{" "}
          <span style={INLINE_CODE_STYLE}>@carma-geo/utils</span> to compare
          zoom output over latitude, shared range, and{" "}
          <a
            href="https://en.wikipedia.org/wiki/Field_of_view"
            rel="noreferrer"
            style={GEO_STORY_STYLES.text.link}
            target="_blank"
          >
            field of view
          </a>
          . The primary left axis on the heatmap represents center resolution in{" "}
          <span style={INLINE_CODE_STYLE}>m/px</span> on a log2 scale,
          comparable to{" "}
          <a
            href="https://en.wikipedia.org/wiki/Ground_sample_distance"
            rel="noreferrer"
            style={GEO_STORY_STYLES.text.link}
            target="_blank"
          >
            ground sample distance
          </a>
          . The secondary left axis shows the equivalent field of view for the
          same shared range.
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>
          The dashed horizontal line marks the shared standard FOV used by the
          lower plot. In <span style={INLINE_CODE_STYLE}>mercator-extreme</span>{" "}
          mode, a dashed vertical line also marks the Web Mercator latitude
          limit. Hover inside the heatmaps to inspect local axis-aligned
          readouts without changing the top bar.
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>
          In <span style={INLINE_CODE_STYLE}>mercator-square</span> mode, the
          x-axis stops at {WEB_MERCATOR_MAX_LATITUDE_DEG.toFixed(3)}° and does
          not extrapolate beyond the Web Mercator extent. In{" "}
          <span style={INLINE_CODE_STYLE}>mercator-extreme</span> mode, the same
          zoom-equivalence scheme is continued for Cesium-style views until the
          90° polar singularity.
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>
          <span style={INLINE_CODE_STYLE}>z quantize</span> optionally buckets
          the heatmap colors into fixed zoom steps, so equal colors represent
          equal zoom bands instead of a fully continuous gradient.
        </p>
      </section>
      <MercatorZoomLatitudeResolutionHeatmap
        baseTileSizePx={baseTileSizePx}
        standardRangeM={effectiveStandardRangeM}
        standardFovDeg={standardFovDeg}
        standardLatitudeDeg={standardLatitudeDeg}
        latitudeMode={latitudeMode}
        zQuantizeStep={zQuantizeStep}
      />
      <MercatorZoomLatitudeRangeHeatmap
        baseTileSizePx={baseTileSizePx}
        standardFovDeg={standardFovDeg}
        standardLatitudeDeg={standardLatitudeDeg}
        latitudeMode={latitudeMode}
        zQuantizeStep={zQuantizeStep}
      />
      <MercatorZoomLatitudeLinePlot
        baseTileSizePx={baseTileSizePx}
        standardRangeM={effectiveStandardRangeM}
        standardFovDeg={standardFovDeg}
        standardLatitudeDeg={standardLatitudeDeg}
        latitudeMode={latitudeMode}
        zQuantizeStep={zQuantizeStep}
      />
    </GeoChartStoryFrame>
  );
};

export const MercatorZoomReferenceTables = ({
  baseTileSizePx,
  standardFovDeg,
  standardLatitudeDeg,
  minimumForwardZoom,
  maximumForwardZoom,
}: MercatorZoomReferenceStoryArgs) => {
  const absLat = Math.min(
    Math.abs(standardLatitudeDeg),
    WEB_MERCATOR_MAX_LATITUDE_DEG - 0.001
  ) as Degrees;

  const fovVerticalRad = degToRadNumeric(standardFovDeg) as Radians;
  const tanHalfFov = Math.tan((fovVerticalRad as number) * 0.5);
  const halfMaxViewport = Math.max(VIEWPORT_WIDTH_PX, VIEWPORT_HEIGHT_PX) * 0.5;

  const forwardRows = useMemo(() => {
    const minimumZoom = Math.max(
      0,
      Math.floor(Math.min(minimumForwardZoom, maximumForwardZoom))
    );
    const maximumZoom = Math.min(
      30,
      Math.ceil(Math.max(minimumForwardZoom, maximumForwardZoom))
    );

    return Array.from({ length: maximumZoom - minimumZoom + 1 }, (_, i) => {
      const zoom = maximumZoom - i;
      const mPerPx = metersPerPixel(zoom, absLat, { tileSize: baseTileSizePx });
      const rangeM =
        Number.isFinite(mPerPx) && mPerPx > 0 && tanHalfFov > 1e-9
          ? (mPerPx * halfMaxViewport) / tanHalfFov
          : NaN;
      return { zoom, mPerPx, rangeM };
    });
  }, [
    absLat,
    baseTileSizePx,
    halfMaxViewport,
    maximumForwardZoom,
    minimumForwardZoom,
    tanHalfFov,
  ]);

  const inverseRows = useMemo(
    () =>
      INVERSE_RANGES_M.map((rangeM) => {
        const raw = mercatorZoomFromDistanceAtLatitudeDeg(rangeM, absLat, {
          fovVerticalRad,
          tileSize: baseTileSizePx,
          viewportWidthPx: VIEWPORT_WIDTH_PX,
          viewportHeightPx: VIEWPORT_HEIGHT_PX,
        });
        const zoom =
          typeof raw === "number" && Number.isFinite(raw) ? raw : NaN;
        const mPerPx = Number.isFinite(zoom)
          ? metersPerPixel(Math.round(zoom), absLat, {
              tileSize: baseTileSizePx,
            })
          : NaN;
        return { rangeM, zoom, mPerPx };
      }),
    [absLat, baseTileSizePx, fovVerticalRad]
  );

  const normalizedMinimumForwardZoom = Math.max(
    0,
    Math.floor(Math.min(minimumForwardZoom, maximumForwardZoom))
  );
  const normalizedMaximumForwardZoom = Math.min(
    30,
    Math.ceil(Math.max(minimumForwardZoom, maximumForwardZoom))
  );
  const hasCustomForwardZoomRange =
    normalizedMinimumForwardZoom !== DEFAULT_REFERENCE_MINIMUM_FORWARD_ZOOM ||
    normalizedMaximumForwardZoom !== DEFAULT_REFERENCE_MAXIMUM_FORWARD_ZOOM;
  const referenceStatusLabel = hasCustomForwardZoomRange
    ? `Zoom by Range and Resolution Reference (${normalizedMinimumForwardZoom}-${normalizedMaximumForwardZoom})`
    : "Zoom by Range and Resolution Reference";

  const statusValues = useMemo(
    () => [
      `lat ${d3Format(".1f")(standardLatitudeDeg)}°`,
      `fov ${d3Format(".1f")(standardFovDeg)}°`,
      `tile ${baseTileSizePx}px`,
    ],
    [baseTileSizePx, standardFovDeg, standardLatitudeDeg]
  );

  const th: CSSProperties = {
    padding: "4px 14px",
    textAlign: "right",
    fontWeight: 600,
    color: "#475569",
    fontSize: 11,
    borderBottom: "2px solid #cbd5e1",
    whiteSpace: "nowrap",
  };
  const stickySectionHeaderStyle: CSSProperties = {
    ...th,
    position: "sticky",
    top: TABLE_HEADER_STICKY_TOP_PX,
    zIndex: 3,
    background: "#e2e8f0",
    boxShadow: "0 1px 0 rgba(148, 163, 184, 0.55)",
  };
  const stickyColumnHeaderStyle: CSSProperties = {
    ...th,
    position: "sticky",
    top: TABLE_HEADER_STICKY_TOP_PX + TABLE_SECTION_HEADER_HEIGHT_PX,
    zIndex: 2,
    background: "#e2e8f0",
    boxShadow: "0 1px 0 rgba(148, 163, 184, 0.55)",
  };
  const td: CSSProperties = {
    padding: "2px 14px",
    textAlign: "right",
    borderBottom: "1px solid #e2e8f0",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
  const tableStyle: CSSProperties = {
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 12,
    fontFamily: GEO_STORY_STYLES.text.svg.fontFamily,
    color: "#334155",
  };

  return (
    <GeoChartStoryFrame label={referenceStatusLabel} values={statusValues}>
      <section style={GEO_STORY_STYLES.layout.panel}>
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th
                  colSpan={3}
                  style={{
                    ...stickySectionHeaderStyle,
                    textAlign: "left",
                    paddingBottom: 6,
                  }}
                >
                  forward · zoom → range
                </th>
              </tr>
              <tr>
                <th style={stickyColumnHeaderStyle}>zoom</th>
                <th style={stickyColumnHeaderStyle}>m/px</th>
                <th style={stickyColumnHeaderStyle}>range</th>
              </tr>
            </thead>
            <tbody>
              {forwardRows.map((row) => (
                <tr key={row.zoom}>
                  <td style={td}>{row.zoom}</td>
                  <td style={td}>{formatMPerPx(row.mPerPx)}</td>
                  <td style={td}>{formatRangeM(row.rangeM)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th
                  colSpan={3}
                  style={{
                    ...stickySectionHeaderStyle,
                    textAlign: "left",
                    paddingBottom: 6,
                  }}
                >
                  inverse · range → zoom
                </th>
              </tr>
              <tr>
                <th style={stickyColumnHeaderStyle}>range</th>
                <th style={stickyColumnHeaderStyle}>zoom</th>
                <th style={stickyColumnHeaderStyle}>m/px</th>
              </tr>
            </thead>
            <tbody>
              {inverseRows.map((row) => (
                <tr key={row.rangeM}>
                  <td style={td}>{formatRangeM(row.rangeM)}</td>
                  <td style={td}>
                    {Number.isFinite(row.zoom)
                      ? d3Format(".2f")(row.zoom)
                      : "—"}
                  </td>
                  <td style={td}>{formatMPerPx(row.mPerPx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </GeoChartStoryFrame>
  );
};
