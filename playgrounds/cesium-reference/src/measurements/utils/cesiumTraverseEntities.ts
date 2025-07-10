import { Cartesian3, Color, Entity } from "cesium";

export const createPointMarker = (
  position: Cartesian3,
  id?: string
): Entity => {
  return new Entity({
    id: id || `measurement-point-marker-${Date.now()}`,
    position: position,
    point: {
      pixelSize: 8,
      color: Color.LIGHTYELLOW,
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      heightReference: 0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
};
