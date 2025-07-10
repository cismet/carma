import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  LabelGraphics,
  LabelStyle,
  NearFarScalar,
} from "cesium";
import { MeasurementEntry } from "../types/MeasurementTypes";
import { normalizeOptions } from "@carma-commons/utils";
import { formatDistance } from "../../utils/formatters";

export const SCALE_BY_DISTANCE = new NearFarScalar(0, 1, 5000, 0.0);
export const SCALE_BY_DISTANCE_POINTS = new NearFarScalar(0, 1, 5000, 0.5);

export const LABEL_FONT = "bold 20px Univers, Verdana Pro, sans-serif";

export const formatNumberToEnclosed = (num: number): string => {
  const digitMap: Record<string, string> = {
    "0": "⓪",
    "1": "①",
    "2": "②",
    "3": "③",
    "4": "④",
    "5": "⑤",
    "6": "⑥",
    "7": "⑦",
    "8": "⑧",
    "9": "⑨",
  };

  return Math.round(num)
    .toString()
    .split("")
    .map((digit) => digitMap[digit] || digit)
    .join("");
};

type LabelOptions = LabelGraphics.ConstructorOptions;

const defaultLabelOptions: LabelOptions = {
  show: true,
  text: "n/a",
  font: LABEL_FONT,
  fillColor: Color.WHITESMOKE,
  showBackground: false,
  backgroundColor: Color.BLACK.withAlpha(0.5),
  backgroundPadding: new Cartesian2(12, 6),
  outlineColor: Color.BLACK.withAlpha(0.9),
  outlineWidth: 3,
  style: LabelStyle.FILL_AND_OUTLINE,
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
      showBackground: false,
      //backgroundColor: Color.BLACK.withAlpha(0.7),
      //backgroundPadding: new Cartesian2(8, 4),
      outlineColor: Color.BLACK.withAlpha(0.9),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -20),
      scaleByDistance,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      horizontalOrigin: 0,
      verticalOrigin: 0,
    },
  });
};

export const createSegmentNodeLabel = (
  position: Cartesian3,
  pointIndex: number,
  cumulativeDistance: number,
  id?: string,
  isSingleSegment: boolean = false
): Entity => {
  const pointLabelText =
    pointIndex === 0 || isSingleSegment
      ? formatNumberToEnclosed(pointIndex + 1)
      : `${formatNumberToEnclosed(pointIndex + 1)} ${formatDistance(
          cumulativeDistance
        )}`;
  return new Entity({
    id: id || `measurement-point-label-${Date.now()}`,
    position: position,
    label: {
      text: pointLabelText,
      font: "bold 16px Arial",
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK.withAlpha(0.9),
      outlineWidth: 3,
      showBackground: false,
      pixelOffset: new Cartesian2(0, -25),
      scale: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      style: LabelStyle.FILL_AND_OUTLINE,
    },
  });
};
