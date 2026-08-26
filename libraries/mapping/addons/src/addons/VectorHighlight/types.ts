import type { DrawShape, RectSize } from "@carma-mapping/engines/maplibre";
import type { Positions } from "@carma-mapping/map-controls-layout";

import type { HighlightOperation } from "./operations";

export type OperationColors = Partial<Record<HighlightOperation, string>>;

export type HighlightModeState = {
  isOn: boolean;
  shape?: DrawShape;
  /** metres, used when a circle is placed by a click instead of a drag */
  circleRadius?: number;
  /** metres, used when a rectangle is placed by a click instead of a drag */
  rectSize?: RectSize;
  /** metres the next apply adds on top of `appliedBuffer` */
  shapeBuffer?: number;
  /** metres the remembered shape has already grown by; a new shape resets it */
  appliedBuffer?: number;
  /** whether the width applies; on while the buffer panel previews the shape */
  bufferEnabled?: boolean;
  /** bumped by the UI to discard the line being drawn; the addon owns the
   *  drawing manager, so the request travels as a counter rather than a
   *  callback parked in shared state */
  cancelLineVersion?: number;
  /** the buffer panel is open; the last shape is shown with its buffer */
  bufferPanelOpen?: boolean;
  /** a shape has been drawn that can be shown and run again */
  hasLastShape?: boolean;
  /** the last shape is on the map right now, so the button runs it next */
  lastShapeShown?: boolean;
  /** a negative width has shrunk the previewed shape to nothing; running it
   *  would select nothing, so the apply button stays off */
  shapeEmpty?: boolean;
  /** bumped by the UI to put the remembered shape on the map */
  showShapeVersion?: number;
  /** bumped by the UI to take that preview back down */
  hideShapeVersion?: number;
  /** bumped by the UI to run the remembered shape again */
  applyShapeVersion?: number;
  /** what a drag does; only "intersect" draws orange today */
  operation?: HighlightOperation;
  /** panel sections; both open until the row toggles one off */
  showOperations?: boolean;
  showShapes?: boolean;
  /** published from the config so UI outside the addon picks the same colours */
  monochrome?: boolean;
  /** published from the config, same reason */
  operationColors?: OperationColors;
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
  /**
   * Draw and mark every operation in the default blue instead of giving each
   * one its own colour. The operations themselves are unchanged. Default: false
   */
  monochrome?: boolean;
  /**
   * Colour per operation, for the drawn shape and every button that marks it.
   * Only the given ones are overridden; `monochrome` wins over this.
   */
  operationColors?: OperationColors;
  /** Shapes the UI offers, first one preselected.
   *  Default: ["lasso", "circle", "rect", "line"] */
  shapes?: DrawShape[];
  /** Radius in metres a clicked circle starts with. Default: 250 */
  defaultRadius?: number;
  /** Ground size in metres a clicked rectangle starts with. Default: 250 x 250 */
  defaultRectSize?: RectSize;
  /**
   * Metres the buffer panel starts at, for every tool alike. A newly drawn
   * shape starts over at this value with nothing applied yet. It only applies
   * once the panel's toggle is on; until then every shape selects exactly as
   * drawn. Capped at 5000 m. Default: 5
   */
  defaultBuffer?: number;
  /**
   * The panel holds a step, not a total: every apply adds it to what the shape
   * has already grown by, so 10 applied and 1 typed selects at 11 m. Off, the
   * panel holds the whole width and the shape is re-buffered from the geometry
   * as drawn, so applying 5 m twice still selects at 5 m. Default: true
   */
  cumulativeBuffer?: boolean;
  /**
   * Start with the buffer switched on, and switch it back on after every
   * shape. Without it the buffer is a one-off: on for the shape the panel was
   * opened for, off again once that shape has run. Default: false
   */
  bufferOnByDefault?: boolean;
  /**
   * Milliseconds every drawn shape stays on the map after it is finished,
   * before it is wiped — long enough to see what it just selected.
   * 0 wipes it at once. Default: 0
   */
  clearDelay?: number;
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
