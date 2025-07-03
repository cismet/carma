import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  NearFarScalar,
  Property,
} from "cesium";
import { formatDistance } from "../../utils/formatters";
import * as L from "leaflet";
import { scaleOptions } from "../../../../../apps/geoportal/src/app/helper/print";

export const createPointEntity = (
  position: Cartesian3,
  pointIndex: number,
  cumulativeDistance: number
): Entity => {
  const pointLabelText =
    pointIndex === 0 // For the first point, don't show distance, just "1"
      ? "1"
      : `${pointIndex + 1}\n${formatDistance(cumulativeDistance)}`; // Subsequent points: "Index\nCumulativeDist"
  return new Entity({
    id: `measurement-point-${Date.now()}-${pointIndex}`,
    position: position,
    point: {
      pixelSize: 8,
      color: Color.LIGHTYELLOW,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      heightReference: 0, // NONE
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: pointLabelText,
      font: "bold 16px Arial",
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: Color.BLACK.withAlpha(0.7),
      backgroundPadding: new Cartesian2(4, 4),
      style: 0,
      pixelOffset: new Cartesian2(0, -25),
      scale: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
};

export const createSegmentLabel = (
  startPoint: Cartesian3,
  endPoint: Cartesian3,
  segmentDistance: number,
  labelFont: string,
  scaleByDistance: Property | NearFarScalar
): Entity => {
  const midpoint = Cartesian3.midpoint(startPoint, endPoint, new Cartesian3());
  const labelText = formatDistance(segmentDistance);
  return new Entity({
    id: `measurement-segment-${Date.now()}-${Math.random()}`,
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
  labelFont: string,
  scaleByDistance: Property | NearFarScalar
): Entity => {
  const lastPoint = points[points.length - 1];
  return new Entity({
    id: `measurement-total-${Date.now()}`,
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
