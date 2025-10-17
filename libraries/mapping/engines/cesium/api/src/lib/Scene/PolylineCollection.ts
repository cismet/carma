// Re-export PolylineCollection class from Cesium
import { PolylineCollection } from "cesium";
export { PolylineCollection };

export const isValidPolylineCollection = (
  collection: unknown
): collection is PolylineCollection => {
  return (
    collection instanceof PolylineCollection &&
    collection.isDestroyed() === false
  );
};
