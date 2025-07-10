import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HorizontalOrigin,
  LabelGraphics,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
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
  fillColor: Color.BLACK,
  showBackground: false,
  backgroundColor: Color.DARKSLATEGREY.withAlpha(0.5),
  backgroundPadding: new Cartesian2(12, 6),
  outlineColor: Color.WHITE.withAlpha(0.75),
  outlineWidth: 5,
  style: LabelStyle.FILL_AND_OUTLINE,
  pixelOffset: new Cartesian2(0, 40),
  //scaleByDistance: SCALE_BY_DISTANCE,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
  horizontalOrigin: HorizontalOrigin.CENTER,
  verticalOrigin: VerticalOrigin.BASELINE,
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
  id?: string
): Entity => {
  const midpoint = Cartesian3.midpoint(startPoint, endPoint, new Cartesian3());
  const labelText = formatDistance(segmentDistance);

  const measurementEntry = {
    id: id || `measurement-segment-${Date.now()}-${Math.random()}`,
    name: `Segment ${labelText}`,
    geometryECEF: midpoint,
  } as MeasurementEntry;

  const labelOptions: LabelOptions = {
    text: labelText,
    pixelOffset: new Cartesian2(0, -20),
  };

  return createLabelEntity(measurementEntry, midpoint, labelOptions);
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

  const measurementEntry = {
    id: id || `measurement-point-label-${Date.now()}`,
    name: `Point ${pointIndex + 1}`,
    geometryECEF: position,
  } as MeasurementEntry;

  const labelOptions: LabelOptions = {
    text: pointLabelText,
    pixelOffset: new Cartesian2(0, -25),
  };

  return createLabelEntity(measurementEntry, position, labelOptions);
};
