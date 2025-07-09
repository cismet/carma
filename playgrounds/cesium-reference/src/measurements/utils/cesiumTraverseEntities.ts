import { Cartesian2, Cartesian3, Color, Entity } from "cesium";
import { formatDistance } from "../../utils/formatters";

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
