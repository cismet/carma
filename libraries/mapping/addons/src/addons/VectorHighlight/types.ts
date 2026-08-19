import type { DrawShape, RectSize } from "@carma-mapping/engines/maplibre";
import type { Positions } from "@carma-mapping/map-controls-layout";

export type HighlightModeState = {
  isOn: boolean;
  shape?: DrawShape;
  /** metres, used when a circle is placed by a click instead of a drag */
  circleRadius?: number;
  /** metres, used when a rectangle is placed by a click instead of a drag */
  rectSize?: RectSize;
  /** published by the addon so UI outside it knows what to offer */
  availableShapes?: DrawShape[];
};

export type VectorHighlightConfig = {
  /** Modifier for click-to-toggle; `null` disables it. Default: "alt" */
  modifierClick?: "alt" | "ctrl" | "shift" | "meta" | null;
  /** Opacity of non-highlighted features; `null` leaves paint alone. Default: 0.25 */
  dimOpacity?: number | null;
  /** Feature-state key, must match the style if it dims itself. Default: "highlighted" */
  stateKey?: string;
  /** Layer ids containing one of these (lowercased) are never dimmed. */
  excludedLayerPatterns?: string[];
  /**
   * Alt+drag draws the selected shape without entering the mode first; every
   * feature it covers is toggled the same way a modifier+click would. Default: false.
   */
  lasso?: boolean;
  /** Shapes the UI offers, first one preselected. Default: ["lasso", "circle", "rect"] */
  shapes?: DrawShape[];
  /** Radius in metres a clicked circle starts with. Default: 250 */
  defaultRadius?: number;
  /** Ground size in metres a clicked rectangle starts with. Default: 250 x 250 */
  defaultRectSize?: RectSize;
  /** Dragged radii and edge lengths snap to a multiple of this, in metres. Default: 5 */
  radiusStep?: number;
  /**
   * Highlight all source layers of a catalog layer together, so an object drawn
   * as icon and shape highlights as a whole. Default: true.
   */
  combineLayerGeometries?: boolean;
  /** Catalog layer ids (substring, case-insensitive) never combined. */
  excludeCombinedLayers?: string[];
};

export type VectorHighlightControlConfig = {
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 70 */
  controlOrder?: number;
};
