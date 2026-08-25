import { faDrawPolygon, faRoute } from "@fortawesome/free-solid-svg-icons";
import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { DrawShape } from "@carma-mapping/engines/maplibre";

/** width the buffer panel starts with; switched off until the toggle is on */
export const DEFAULT_BUFFER_WIDTH = 25;

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
