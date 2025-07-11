import { Cartesian3, Color, Entity, HeightReference } from "cesium";

export const createPointMarker = (
  position: Cartesian3,
  id?: string
): Entity => {
  return new Entity({
    id: id || `measurement-point-marker-${Date.now()}`,
    position: position,
    point: {
      pixelSize: 11,
      color: Color.WHITESMOKE,
      outlineColor: Color.BLACK,
      outlineWidth: 0,
      heightReference: HeightReference.NONE,
      //disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
};
