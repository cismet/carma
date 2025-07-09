import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  LabelGraphics,
  NearFarScalar,
} from "cesium";
import { MeasurementEntry } from "../types/MeasurementTypes";
import { normalizeOptions } from "@carma-commons/utils";
import { formatDistance } from "../../utils/formatters";

export const SCALE_BY_DISTANCE = new NearFarScalar(0, 1, 5000, 0.0);
export const SCALE_BY_DISTANCE_POINTS = new NearFarScalar(0, 1, 5000, 0.5);

export const LABEL_FONT = "bold 20px Univers, Verdana Pro, sans-serif";

type LabelOptions = LabelGraphics.ConstructorOptions;

const defaultLabelOptions: LabelOptions = {
  show: true,
  text: "n/a",
  font: LABEL_FONT,
  fillColor: Color.WHITESMOKE,
  showBackground: true,
  backgroundColor: Color.BLACK.withAlpha(0.5),
  backgroundPadding: new Cartesian2(12, 6),
  style: 0,
  pixelOffset: new Cartesian2(0, 40),
  scaleByDistance: SCALE_BY_DISTANCE,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
};

export const createLabelEntity = (
  { id, name, geometryECEF }: MeasurementEntry,
  position?: Cartesian3,
  options?: LabelOptions
) => {
  const label: LabelOptions = normalizeOptions(options, defaultLabelOptions);

  // If no position is provided, use the geometryECEF as position as Fallback
  if (!position) {
    position = Array.isArray(geometryECEF) ? geometryECEF[0] : geometryECEF;
  }

  const entity = new Entity({ id, name, position, label });
  return entity;
};

export const createSegmentLabel = (
  startPoint: Cartesian3,
  endPoint: Cartesian3,
  segmentDistance: number,
  labelFont = LABEL_FONT,
  scaleByDistance = SCALE_BY_DISTANCE,
  id?: string
): Entity => {
  const midpoint = Cartesian3.midpoint(startPoint, endPoint, new Cartesian3());
  const labelText = formatDistance(segmentDistance);
  return new Entity({
    id: id || `measurement-segment-${Date.now()}-${Math.random()}`,
    position: midpoint,
    label: {
      text: labelText,
      font: labelFont,
      fillColor: Color.LIGHTYELLOW,
      showBackground: true,
      backgroundColor: Color.BLACK.withAlpha(0.7),
      backgroundPadding: new Cartesian2(8, 4),
      style: 0,
      pixelOffset: new Cartesian2(0, -20),
      scaleByDistance,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
};

export const createTotalLabel = (
  points: Cartesian3[],
  totalDistance: number,
  labelFont = LABEL_FONT,
  scaleByDistance = SCALE_BY_DISTANCE,
  id?: string
): Entity => {
  const lastPoint = points[points.length - 1];
  return new Entity({
    id: id || `measurement-total-${Date.now()}`,
    position: lastPoint,
    label: {
      text: `Total: ${formatDistance(totalDistance)}`,
      font: labelFont,
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: Color.BLACK.withAlpha(0.8),
      backgroundPadding: new Cartesian2(12, 6),
      style: 0,
      pixelOffset: new Cartesian2(0, 30),
      scaleByDistance: scaleByDistance,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
};
