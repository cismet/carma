import { faDrawPolygon, faRoute } from "@fortawesome/free-solid-svg-icons";
import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { DrawShape } from "@carma-mapping/engines/maplibre";

/** metres the buffer panel's step starts at */
export const DEFAULT_BUFFER_WIDTH = 5;

/** ceiling for the grown width, in metres */
export const MAX_BUFFER_WIDTH = 5000;

/** floor for the width: a negative one shrinks the shape instead of growing
 *  it, down to nothing at all */
export const MIN_BUFFER_WIDTH = -MAX_BUFFER_WIDTH;

/** Keeps a width inside the range a buffer may take. */
export const clampBufferWidth = (meters: number) =>
  Math.min(Math.max(meters, MIN_BUFFER_WIDTH), MAX_BUFFER_WIDTH);

export const DEFAULT_SHAPES: DrawShape[] = ["lasso", "line", "circle", "rect"];

export const SHAPE_LABELS: Record<DrawShape, string> = {
  lasso: "Lasso",
  circle: "Kreis",
  rect: "Rechteck",
  line: "Linienzug",
};

export const SHAPE_ICONS: Record<DrawShape, IconDefinition> = {
  lasso: faDrawPolygon,
  circle: faCircle,
  rect: faSquare,
  line: faRoute,
};
