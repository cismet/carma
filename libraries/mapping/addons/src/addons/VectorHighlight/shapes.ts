import { faDrawPolygon, faRoute } from "@fortawesome/free-solid-svg-icons";
import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { DrawShape } from "@carma-mapping/engines/maplibre";

export const DEFAULT_SHAPES: DrawShape[] = ["lasso", "circle", "rect", "line"];

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
