import {
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";

/** Which visual language the terra-draw modes are dressed in.
 *
 *  - `"terra-draw"` — terra-draw's own defaults with only the selection
 *    sizes bumped so a selected feature reads at a glance. This is what
 *    every host got before the carma variant existed; belis and the
 *    playgrounds stay on it.
 *  - `"carma"` — mirrors the leaflet measurement mode (grey idle geometry,
 *    `#267bdc` for selection, small translucent white vertex / midpoint /
 *    draw-aid handles) so a geoportal user switching engines sees the same
 *    drawing. Also turns on per-vertex handles while drawing.
 */
export type MeasurementStyleVariant = "terra-draw" | "carma";

type PointStyles = NonNullable<
  NonNullable<ConstructorParameters<typeof TerraDrawPointMode>[0]>["styles"]
>;
type LineStringStyles = NonNullable<
  NonNullable<
    ConstructorParameters<typeof TerraDrawLineStringMode>[0]
  >["styles"]
>;
type PolygonStyles = NonNullable<
  NonNullable<ConstructorParameters<typeof TerraDrawPolygonMode>[0]>["styles"]
>;
type SelectStyles = NonNullable<
  NonNullable<ConstructorParameters<typeof TerraDrawSelectMode>[0]>["styles"]
>;

export interface MeasurementStyleSet {
  point: PointStyles;
  lineString: LineStringStyles;
  polygon: PolygonStyles;
  select: SelectStyles;
  /** Whether line / polygon modes render a dot on every committed vertex
   *  while drawing (instead of only marking the latest one). */
  showCoordinatePoints: boolean;
}

// Palette + metrics mirroring the leaflet measurement mode. Sources:
//   - `path.custom-polyline { stroke: gray }` and the 8px, 50%-white,
//     0.75px-black-bordered `.leaflet-marker-icon.leaflet-div-icon` vertex
//     handles in @carma-commons/measurements' `m-style.css`
//   - the saved-measurement adhoc layers in that lib's `utils/helper.ts`
//     (grey 2-3px idle strokes, `#267bdc` @ 0.3 fill, selection stroke
//     `rgba(38, 123, 220, 0.83)`)
// Terra-draw takes opacity as its own key rather than baked into the color,
// hence SELECTED_OPACITY instead of an rgba() string.
const IDLE_COLOR = "#808080";
const SELECTED_COLOR = "#267bdc";
const SELECTED_OPACITY = 0.83;
const FILL_OPACITY = 0.3;
// Idle polygons stay grey like their outline — "blue means selected" is the
// single rule the leaflet mode reads by.
const IDLE_FILL_OPACITY = 0.15;
const IDLE_LINE_WIDTH = 2;
const SELECTED_LINE_WIDTH = 3;
// Vertex / midpoint / draw-aid handles: the leaflet div-icon is 8px across,
// i.e. a radius of 4.
const HANDLE_RADIUS = 4;
const HANDLE_FILL_COLOR = "#ffffff";
const HANDLE_FILL_OPACITY = 0.5;
const HANDLE_OUTLINE_COLOR = "#000000";
const HANDLE_OUTLINE_WIDTH = 1;

/** Custom property the host stamps on a feature that should PAINT as
 *  selected without terra-draw's select mode actually owning it. Needed
 *  right after `finish`, where the instance is still in a draw mode and
 *  `selectFeature()` is not callable, but the just-drawn measurement should
 *  already read as the active one. Not a terra-draw reserved key. */
export const MEASUREMENT_SELECTED_PROPERTY = "carmaSelected";

const isPseudoSelected = (feature: GeoJSONStoreFeatures): boolean =>
  feature.properties?.[MEASUREMENT_SELECTED_PROPERTY] === true;

/** Picks the "active" value while the feature is being drawn OR is flagged
 *  as pseudo-selected, the idle value otherwise. */
const whileActive = <T,>(activeValue: T, idleValue: T) => {
  return (feature: GeoJSONStoreFeatures): T => {
    return feature.properties?.currentlyDrawing === true ||
      isPseudoSelected(feature)
      ? activeValue
      : idleValue;
  };
};

/** terra-draw's own look, with the selection sizes bumped (~2× the
 *  defaults) because the defaults are too subtle to read at a glance.
 *  Colors stay at terra-draw's defaults. */
const terraDrawStyles: MeasurementStyleSet = {
  point: {},
  lineString: {},
  polygon: {},
  select: {
    selectedLineStringWidth: 8,
    selectedPointWidth: 12,
    selectionPointWidth: 12,
  },
  showCoordinatePoints: false,
};

/**
 * Builds the carma (leaflet-parity) style set.
 *
 * @param isVertexOfDrawingFeature Predicate answering "does this
 *   coordinate-point handle belong to a feature that is currently being
 *   drawn?". Lives in the host because it needs a live terra-draw instance
 *   to resolve the handle's parent feature; handles of finished features
 *   are rendered at width 0 (i.e. hidden) so only the in-progress geometry
 *   shows its vertices.
 */
const buildCarmaStyles = (
  isVertexOfDrawingFeature: (feature: GeoJSONStoreFeatures) => boolean
): MeasurementStyleSet => {
  const vertexStyles = {
    coordinatePointWidth: (feature: GeoJSONStoreFeatures) =>
      isVertexOfDrawingFeature(feature) ? HANDLE_RADIUS : 0,
    coordinatePointColor: HANDLE_FILL_COLOR,
    coordinatePointOpacity: (feature: GeoJSONStoreFeatures) =>
      isVertexOfDrawingFeature(feature) ? HANDLE_FILL_OPACITY : 0,
    coordinatePointOutlineColor: HANDLE_OUTLINE_COLOR,
    coordinatePointOutlineWidth: (feature: GeoJSONStoreFeatures) =>
      isVertexOfDrawingFeature(feature) ? HANDLE_OUTLINE_WIDTH : 0,
    // `as const` keeps the color literals from widening to `string`, which
    // terra-draw's `#${string}` styling types reject.
  } as const;

  // Draw aids (the closing dot, the snap indicator) read as vertex handles.
  const drawAidStyles = {
    closingPointWidth: HANDLE_RADIUS,
    closingPointColor: HANDLE_FILL_COLOR,
    closingPointOpacity: HANDLE_FILL_OPACITY,
    closingPointOutlineColor: HANDLE_OUTLINE_COLOR,
    closingPointOutlineWidth: HANDLE_OUTLINE_WIDTH,
    snappingPointWidth: HANDLE_RADIUS,
    snappingPointColor: HANDLE_FILL_COLOR,
    snappingPointOpacity: HANDLE_FILL_OPACITY,
    snappingPointOutlineColor: HANDLE_OUTLINE_COLOR,
    snappingPointOutlineWidth: HANDLE_OUTLINE_WIDTH,
  } as const;

  return {
    point: {
      pointWidth: whileActive(HANDLE_RADIUS + 2, HANDLE_RADIUS + 1),
      pointColor: whileActive(SELECTED_COLOR, IDLE_COLOR),
      pointOutlineColor: "#ffffff",
      pointOutlineWidth: HANDLE_OUTLINE_WIDTH,
    },
    lineString: {
      lineStringWidth: whileActive(SELECTED_LINE_WIDTH, IDLE_LINE_WIDTH),
      lineStringColor: whileActive(SELECTED_COLOR, IDLE_COLOR),
      lineStringOpacity: whileActive(SELECTED_OPACITY, 1),
      ...drawAidStyles,
      ...vertexStyles,
    },
    polygon: {
      outlineWidth: whileActive(SELECTED_LINE_WIDTH, IDLE_LINE_WIDTH),
      outlineColor: whileActive(SELECTED_COLOR, IDLE_COLOR),
      outlineOpacity: whileActive(SELECTED_OPACITY, 1),
      fillColor: whileActive(SELECTED_COLOR, IDLE_COLOR),
      fillOpacity: whileActive(FILL_OPACITY, IDLE_FILL_OPACITY),
      ...drawAidStyles,
      ...vertexStyles,
    },
    // Selection = the leaflet mode's blue: the geometry keeps its idle width
    // class (only marginally thicker) and it's the COLOR that carries the
    // state change, with small translucent white vertex / midpoint handles
    // on top.
    select: {
      selectedLineStringWidth: SELECTED_LINE_WIDTH,
      selectedLineStringColor: SELECTED_COLOR,
      selectedLineStringOpacity: SELECTED_OPACITY,
      selectedPolygonOutlineWidth: SELECTED_LINE_WIDTH,
      selectedPolygonOutlineColor: SELECTED_COLOR,
      selectedPolygonOutlineOpacity: SELECTED_OPACITY,
      selectedPolygonColor: SELECTED_COLOR,
      selectedPolygonFillOpacity: FILL_OPACITY,
      selectedPointWidth: HANDLE_RADIUS + 2,
      selectedPointColor: SELECTED_COLOR,
      selectedPointOutlineColor: "#ffffff",
      selectedPointOutlineWidth: HANDLE_OUTLINE_WIDTH,
      selectionPointWidth: HANDLE_RADIUS,
      selectionPointColor: HANDLE_FILL_COLOR,
      selectionPointOpacity: HANDLE_FILL_OPACITY,
      selectionPointOutlineColor: HANDLE_OUTLINE_COLOR,
      selectionPointOutlineWidth: HANDLE_OUTLINE_WIDTH,
      midPointWidth: HANDLE_RADIUS - 1,
      midPointColor: HANDLE_FILL_COLOR,
      midPointOpacity: HANDLE_FILL_OPACITY,
      midPointOutlineColor: HANDLE_OUTLINE_COLOR,
      midPointOutlineWidth: HANDLE_OUTLINE_WIDTH,
    },
    showCoordinatePoints: true,
  };
};

export const buildMeasurementStyles = (
  variant: MeasurementStyleVariant,
  isVertexOfDrawingFeature: (feature: GeoJSONStoreFeatures) => boolean
): MeasurementStyleSet =>
  variant === "carma"
    ? buildCarmaStyles(isVertexOfDrawingFeature)
    : terraDrawStyles;
