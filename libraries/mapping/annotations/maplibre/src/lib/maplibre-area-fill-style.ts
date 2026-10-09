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
  /**
   * The ruler of a metric line: every other grid cell keeps this share of
   * the line's opacity (the minor beat), and every other major cell is
   * drawn wider underneath. The major pitch is the first of the series at
   * least `rulerMajorMinRatio` times the grid pitch: 5 m over 1 m, 10 m
   * over 2 m, 50 m over 5 m.
   */
  rulerMinorOpacityShare?: number;
  rulerMajorMinRatio?: number;
  rulerMajorWidthFactor?: number;
  rulerMajorOpacityShare?: number;
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
    rulerMinorOpacityShare: 0.7,
    rulerMajorMinRatio: 5,
    rulerMajorWidthFactor: 2.2,
    rulerMajorOpacityShare: 0.3,
  });

const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isUnitShare = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

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
    rulerMinorOpacityShare: isUnitShare(options.rulerMinorOpacityShare)
      ? options.rulerMinorOpacityShare
      : defaults.rulerMinorOpacityShare,
    rulerMajorMinRatio:
      isFinitePositive(options.rulerMajorMinRatio) &&
      options.rulerMajorMinRatio >= 2
        ? options.rulerMajorMinRatio
        : defaults.rulerMajorMinRatio,
    rulerMajorWidthFactor:
      isFinitePositive(options.rulerMajorWidthFactor) &&
      options.rulerMajorWidthFactor >= 1
        ? options.rulerMajorWidthFactor
        : defaults.rulerMajorWidthFactor,
    rulerMajorOpacityShare: isUnitShare(options.rulerMajorOpacityShare)
      ? options.rulerMajorOpacityShare
      : defaults.rulerMajorOpacityShare,
  });
};

/**
 * The coarse beat of the ruler: the first pitch of the series at least
 * `rulerMajorMinRatio` times the fine pitch, or the fine pitch times that
 * ratio past the end of the series.
 */
export const resolveRulerMajorPitchMeters = (
  minorPitchMeters: number,
  style: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): number => {
  const threshold = minorPitchMeters * style.rulerMajorMinRatio;
  for (const pitch of style.gridPitchSeriesMeters) {
    if (pitch >= threshold) return pitch;
  }
  return threshold;
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
