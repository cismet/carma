// Re-export ClippingPlaneCollection class from Cesium
import { ClippingPlaneCollection } from "cesium";
export { ClippingPlaneCollection };

export const isValidClippingPlaneCollection = (
  collection: unknown
): collection is ClippingPlaneCollection => {
  return (
    collection instanceof ClippingPlaneCollection &&
    collection.isDestroyed() === false
  );
};
