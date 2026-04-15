import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { Color } from "@carma-cesium";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TYPES;

const POLYGON_FILL_ALPHA = 0.25;
const POLYGON_FILL_SELECTED_ALPHA = 0.35;

const POLYGON_FILL_RGB_BY_TYPE = {
  [ANNOTATION_TYPE_AREA_VERTICAL]: [0.44, 0.66, 1.0],
  [ANNOTATION_TYPE_AREA_GROUND]: [0.42, 0.74, 0.48],
  [ANNOTATION_TYPE_AREA_PLANAR]: [0.94, 0.87, 0.57],
} as const;

export type FillMeasurementType =
  | typeof ANNOTATION_TYPE_AREA_VERTICAL
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_PLANAR;

export const getPolygonFillColor = (
  type: FillMeasurementType,
  isSelected: boolean
) => {
  const [red, green, blue] = POLYGON_FILL_RGB_BY_TYPE[type];
  return new Color(
    red,
    green,
    blue,
    isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA
  );
};
