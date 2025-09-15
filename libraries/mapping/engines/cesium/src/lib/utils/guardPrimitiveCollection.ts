import type { PrimitiveCollection } from "cesium";
import { isValidPrimitiveCollection } from "./instanceGates";

export const guardPrimitiveCollection = (
  collection: PrimitiveCollection,
  label?: string
) => {
  const isValid = () => isValidPrimitiveCollection(collection);
  const ensure = <T>(fn: (ec: PrimitiveCollection) => T, fallback: T): T => {
    if (!isValid()) {
      console.warn("Collection gate invalid", label);
      return fallback;
    }
    try {
      return fn(collection as PrimitiveCollection);
    } catch (e) {
      console.warn("Collection gate call failed", label, e);
      return fallback;
    }
  };

  return {
    add(primitive: unknown) {
      ensure((pc) => pc.add(primitive), undefined);
      return this;
    },
    remove(primitive: unknown) {
      ensure((pc) => pc.remove(primitive), undefined);
      return this;
    },
    contains(primitive: unknown): boolean {
      return ensure((pc) => pc.contains(primitive), false);
    },
    removeAll() {
      ensure((pc) => pc.removeAll(), undefined);
      return this;
    },
  };
};
