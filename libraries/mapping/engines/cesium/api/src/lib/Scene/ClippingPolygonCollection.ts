// Re-export ClippingPolygonCollection class from Cesium
import { ClippingPolygonCollection } from "cesium";
export { ClippingPolygonCollection };

export const isValidClippingPolygonCollection = (
  collection: unknown
): collection is ClippingPolygonCollection => {
  return (
    collection instanceof ClippingPolygonCollection &&
    collection.isDestroyed() === false
  );
};
