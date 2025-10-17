// Re-export PrimitiveCollection class from Cesium
import { PrimitiveCollection } from "cesium";
export { PrimitiveCollection };

export const isValidPrimitiveCollection = (
  collection: unknown
): collection is PrimitiveCollection => {
  return (
    collection instanceof PrimitiveCollection &&
    collection.isDestroyed() === false
  );
};
