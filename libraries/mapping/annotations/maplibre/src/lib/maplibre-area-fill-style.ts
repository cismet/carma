import { isPositiveRatio, isRatio, isUnitRangeRatio } from "@carma-units";

/**
 * How the MapLibre engine draws area fills and the ruler of metric lines.
 * Hosts pass these with their other tool settings; every field is optional
 * and falls back to the defaults below.
 *
 * Area fills: a checkerboard of a metric grid on the visible part, hairline
 * crosshairs on the grid of the part behind a wall or roof, both at a 1-2-5
 * metre pitch picked per frame.
 *
 * Ruler: a dot on a drafted or selected line at every beat of the metric
 * pitch, a larger dot at every fifth beat, sized relative to the line width.
 * Beats closer than the clearance to a node or a segment midpoint are left
 * out so the node handles and the insert ticks stay free.
 */
export type MapLibreAreaFillStyleOptions = {
  /** Multiplies the fill alpha of the lighter checker cells, which read too faint on the textured mesh. */
  visibleOpacityFactor?: number;
  /** The darker checker cells keep this share of the lighter cells' alpha. */
  checkerDarkShare?: number;
  /** Grid pitch candidates in metres of the polygon plane, ascending. */
  gridPitchSeriesMeters?: readonly number[];
  /** The grid pitch is the first of the series that spans at least this many CSS pixels. */
  gridMinPitchCssPx?: number;
  /** Arm length of the crosshairs on the hidden part, in CSS pixels. */
  crosshairArmCssPx?: number;
  /** Line width of those crosshairs, in CSS pixels. */
  crosshairWidthCssPx?: number;
  /** Opacity of the crosshairs; hairlines need more than the cells to read on a textured mesh. */
  crosshairOpacity?: number;
  /** The ruler beat is the first pitch of the series that spans at least this many CSS pixels. */
  rulerMinSegmentCssPx?: number;
  rulerMinorDotWidthFactor?: number;
  rulerMajorDotWidthFactor?: number;
  /** The dots are the line colour scaled by this (below 1: darker) so they read on the line. */
  rulerDotTintFactor?: number;
  /** CSS colour of the dots; null takes the line colour scaled by the tint factor. */
  rulerDotFill?: string | null;
  /** CSS colour of a ring around each dot; `currentColor` takes the line's colour, null draws none. */
  rulerDotStroke?: string | null;
  /** Width of that ring as a share of the line width (1: as wide as the line). */
  rulerDotStrokeWidthFactor?: number;
  /** Beats closer than this to a node or segment midpoint, in CSS pixels, are left out. */
  rulerMarkerClearanceCssPx?: number;
};

export type ResolvedMapLibreAreaFillStyle = Readonly<
  Required<MapLibreAreaFillStyleOptions>
>;

export const MAPLIBRE_AREA_FILL_STYLE_DEFAULTS: ResolvedMapLibreAreaFillStyle =
  Object.freeze({
    visibleOpacityFactor: 1.8,
    checkerDarkShare: 0.78,
    gridPitchSeriesMeters: Object.freeze([
      1, 2, 5, 10, 20, 50, 100, 200, 500, 1000,
    ]),
    gridMinPitchCssPx: 10,
    crosshairArmCssPx: 3,
    crosshairWidthCssPx: 1,
    crosshairOpacity: 0.9,
    rulerMinSegmentCssPx: 32,
    rulerMinorDotWidthFactor: 3.5,
    rulerMajorDotWidthFactor: 5,
    rulerDotTintFactor: 0.6,
    // translucent black dots in a ring of the line colour read on light and dark surfaces alike
    rulerDotFill: "rgba(0, 0, 0, 0.5)",
    rulerDotStroke: "currentColor",
    rulerDotStrokeWidthFactor: 1,
    rulerMarkerClearanceCssPx: 16,
  });

const positiveOr = (value: unknown, fallback: number): number =>
  isPositiveRatio(value) ? value : fallback;

export const resolveMapLibreAreaFillStyle = (
  options: MapLibreAreaFillStyleOptions = {}
): ResolvedMapLibreAreaFillStyle => {
  const defaults = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS;
  const series = options.gridPitchSeriesMeters?.filter(isPositiveRatio);
  const { checkerDarkShare, rulerMarkerClearanceCssPx } = options;
  return Object.freeze({
    visibleOpacityFactor: positiveOr(
      options.visibleOpacityFactor,
      defaults.visibleOpacityFactor
    ),
    checkerDarkShare: isRatio(checkerDarkShare)
      ? Math.min(1, Math.max(0, checkerDarkShare))
      : defaults.checkerDarkShare,
    gridPitchSeriesMeters:
      series && series.length > 0
        ? Object.freeze([...series].sort((left, right) => left - right))
        : defaults.gridPitchSeriesMeters,
    gridMinPitchCssPx: positiveOr(
      options.gridMinPitchCssPx,
      defaults.gridMinPitchCssPx
    ),
    crosshairArmCssPx: positiveOr(
      options.crosshairArmCssPx,
      defaults.crosshairArmCssPx
    ),
    crosshairWidthCssPx: positiveOr(
      options.crosshairWidthCssPx,
      defaults.crosshairWidthCssPx
    ),
    crosshairOpacity: isUnitRangeRatio(options.crosshairOpacity)
      ? options.crosshairOpacity
      : defaults.crosshairOpacity,
    rulerMinSegmentCssPx: positiveOr(
      options.rulerMinSegmentCssPx,
      defaults.rulerMinSegmentCssPx
    ),
    rulerMinorDotWidthFactor: positiveOr(
      options.rulerMinorDotWidthFactor,
      defaults.rulerMinorDotWidthFactor
    ),
    rulerMajorDotWidthFactor: positiveOr(
      options.rulerMajorDotWidthFactor,
      defaults.rulerMajorDotWidthFactor
    ),
    rulerDotTintFactor: positiveOr(
      options.rulerDotTintFactor,
      defaults.rulerDotTintFactor
    ),
    rulerDotFill:
      options.rulerDotFill === undefined
        ? defaults.rulerDotFill
        : options.rulerDotFill,
    rulerDotStroke:
      options.rulerDotStroke === undefined
        ? defaults.rulerDotStroke
        : options.rulerDotStroke,
    rulerDotStrokeWidthFactor: positiveOr(
      options.rulerDotStrokeWidthFactor,
      defaults.rulerDotStrokeWidthFactor
    ),
    rulerMarkerClearanceCssPx:
      isRatio(rulerMarkerClearanceCssPx) && rulerMarkerClearanceCssPx >= 0
        ? rulerMarkerClearanceCssPx
        : defaults.rulerMarkerClearanceCssPx,
  });
};

/** The first pitch of the series that spans at least `minCssPx` at this scale; the coarsest without one. */
const resolveSeriesPitchMeters = (
  pixelsPerMeter: number,
  minCssPx: number,
  style: ResolvedMapLibreAreaFillStyle
): number => {
  const series = style.gridPitchSeriesMeters;
  const coarsest = series[series.length - 1]!;
  if (!(pixelsPerMeter > 0)) return coarsest;
  return series.find((pitch) => pitch * pixelsPerMeter >= minCssPx) ?? coarsest;
};

export const resolveAreaFillGridPitchMeters = (
  pixelsPerMeter: number,
  style: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): number =>
  resolveSeriesPitchMeters(pixelsPerMeter, style.gridMinPitchCssPx, style);

/** The beat of a ruler. */
export const resolveRulerPitchMeters = (
  pixelsPerMeter: number,
  style: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): number =>
  resolveSeriesPitchMeters(pixelsPerMeter, style.rulerMinSegmentCssPx, style);

/** Every this many beats the ruler sets a large dot. */
const RULER_BEATS_PER_MAJOR = 5;

/**
 * The large beat of the ruler, like the half-decimetre marks of a folding
 * rule: every fifth beat (a 1 m beat is marked at 5 m, a 10 m beat at 50 m).
 */
export const resolveRulerMajorPitchMeters = (
  minorPitchMeters: number
): number =>
  minorPitchMeters > 0
    ? minorPitchMeters * RULER_BEATS_PER_MAJOR
    : RULER_BEATS_PER_MAJOR;
