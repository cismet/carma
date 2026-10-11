/**
 * How the MapLibre engine draws area fills: a checkerboard of a metric grid
 * on the visible part, hairline crosshairs on the grid of the part behind a
 * wall or roof, both at a 1-2-5 metre pitch picked per frame. Hosts pass
 * these with their other tool settings (lines, area occlusion); every field
 * is optional and falls back to the defaults below.
 */
export type MapLibreAreaFillStyleOptions = {
  /**
   * The runtime palette is tuned for Cesium's translucent appearance on flat
   * LOD2 walls; on the textured mesh the same alpha reads too faint. The
   * fill alpha is multiplied by this for the lighter checker cells.
   */
  visibleOpacityFactor?: number;
  /** The darker checker cells keep this share of the lighter cells' alpha. */
  checkerDarkShare?: number;
  /** Grid pitch candidates in metres of the polygon plane, ascending. */
  gridPitchSeriesMeters?: readonly number[];
  /** The pitch is the first of the series that spans at least this many CSS pixels. */
  gridMinPitchCssPx?: number;
  /** Arm length of the crosshairs on the hidden part, in CSS pixels. */
  crosshairArmCssPx?: number;
  /** Line width of those crosshairs, in CSS pixels. */
  crosshairWidthCssPx?: number;
  /** Opacity of the crosshairs; hairlines need more than the cells to read on a textured mesh. */
  crosshairOpacity?: number;
  /**
   * The ruler of a drafted or selected line: a dot on the line at every
   * beat of the metric pitch, a larger dot at the decades, both sized
   * relative to the line width and drawn in a darker tint of the line. The beat is the first of the 1-2-5 series
   * that spans the minimum segment; the primary dots sit at 1, 10, 100 m,
   * the secondary ones at the 2 and 5 beats between them. Beats closer than
   * the clearance to a node or to a segment midpoint are left out so the
   * node handles and the insert ticks stay free.
   */
  /** Each beat of the ruler spans at least this many CSS pixels. */
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
    // black dots in a white ring as wide as the line: they read on light
    // and dark surfaces alike (the 2x/3x tinted dots of before did not)
    rulerMinorDotWidthFactor: 3.5,
    rulerMajorDotWidthFactor: 5,
    rulerDotTintFactor: 0.6,
    rulerDotFill: "rgba(0, 0, 0, 0.5)",
    // the ring takes the colour of the line it sits on
    rulerDotStroke: "currentColor",
    rulerDotStrokeWidthFactor: 1,
    rulerMarkerClearanceCssPx: 16,
  });

const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isUnitShare = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

export const resolveMapLibreAreaFillStyle = (
  options: MapLibreAreaFillStyleOptions = {}
): ResolvedMapLibreAreaFillStyle => {
  const defaults = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS;
  const series = options.gridPitchSeriesMeters?.filter(isFinitePositive);
  return Object.freeze({
    visibleOpacityFactor: isFinitePositive(options.visibleOpacityFactor)
      ? options.visibleOpacityFactor
      : defaults.visibleOpacityFactor,
    checkerDarkShare:
      typeof options.checkerDarkShare === "number" &&
      Number.isFinite(options.checkerDarkShare)
        ? Math.min(1, Math.max(0, options.checkerDarkShare))
        : defaults.checkerDarkShare,
    gridPitchSeriesMeters:
      series && series.length > 0
        ? Object.freeze([...series].sort((left, right) => left - right))
        : defaults.gridPitchSeriesMeters,
    gridMinPitchCssPx: isFinitePositive(options.gridMinPitchCssPx)
      ? options.gridMinPitchCssPx
      : defaults.gridMinPitchCssPx,
    crosshairArmCssPx: isFinitePositive(options.crosshairArmCssPx)
      ? options.crosshairArmCssPx
      : defaults.crosshairArmCssPx,
    crosshairWidthCssPx: isFinitePositive(options.crosshairWidthCssPx)
      ? options.crosshairWidthCssPx
      : defaults.crosshairWidthCssPx,
    crosshairOpacity: isUnitShare(options.crosshairOpacity)
      ? options.crosshairOpacity
      : defaults.crosshairOpacity,
    rulerMinSegmentCssPx: isFinitePositive(options.rulerMinSegmentCssPx)
      ? options.rulerMinSegmentCssPx
      : defaults.rulerMinSegmentCssPx,
    rulerMinorDotWidthFactor: isFinitePositive(options.rulerMinorDotWidthFactor)
      ? options.rulerMinorDotWidthFactor
      : defaults.rulerMinorDotWidthFactor,
    rulerMajorDotWidthFactor: isFinitePositive(options.rulerMajorDotWidthFactor)
      ? options.rulerMajorDotWidthFactor
      : defaults.rulerMajorDotWidthFactor,
    rulerDotTintFactor: isFinitePositive(options.rulerDotTintFactor)
      ? options.rulerDotTintFactor
      : defaults.rulerDotTintFactor,
    rulerDotFill:
      options.rulerDotFill === undefined
        ? defaults.rulerDotFill
        : options.rulerDotFill,
    rulerDotStroke:
      options.rulerDotStroke === undefined
        ? defaults.rulerDotStroke
        : options.rulerDotStroke,
    rulerDotStrokeWidthFactor: isFinitePositive(
      options.rulerDotStrokeWidthFactor
    )
      ? options.rulerDotStrokeWidthFactor
      : defaults.rulerDotStrokeWidthFactor,
    rulerMarkerClearanceCssPx:
      typeof options.rulerMarkerClearanceCssPx === "number" &&
      Number.isFinite(options.rulerMarkerClearanceCssPx) &&
      options.rulerMarkerClearanceCssPx >= 0
        ? options.rulerMarkerClearanceCssPx
        : defaults.rulerMarkerClearanceCssPx,
  });
};

/** The beat of a ruler: the first pitch of the series that spans the minimum segment. */
export const resolveRulerPitchMeters = (
  pixelsPerMeter: number,
  style: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): number => {
  const series = style.gridPitchSeriesMeters;
  const coarsest = series[series.length - 1]!;
  if (!(pixelsPerMeter > 0)) return coarsest;
  for (const pitch of series) {
    if (pitch * pixelsPerMeter >= style.rulerMinSegmentCssPx) return pitch;
  }
  return coarsest;
};

/** Every this many beats the ruler sets a large dot. */
export const RULER_BEATS_PER_MAJOR = 5;

/**
 * The large beat of the ruler, like the half-decimetre marks of a folding
 * rule: every fifth beat. A 1 m beat is marked at 5 m, a 2 m beat at 10 m,
 * a 10 m beat at 50 m and a 20 m beat at 100 m.
 */
export const resolveRulerMajorPitchMeters = (
  minorPitchMeters: number
): number => {
  if (!(minorPitchMeters > 0)) return RULER_BEATS_PER_MAJOR;
  return minorPitchMeters * RULER_BEATS_PER_MAJOR;
};

/** The first pitch of the series that spans at least the minimum pixels at this scale. */
export const resolveAreaFillGridPitchMeters = (
  pixelsPerMeter: number,
  style: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): number => {
  const series = style.gridPitchSeriesMeters;
  const coarsest = series[series.length - 1]!;
  if (!(pixelsPerMeter > 0)) return coarsest;
  for (const pitch of series) {
    if (pitch * pixelsPerMeter >= style.gridMinPitchCssPx) return pitch;
  }
  return coarsest;
};
