import { isValidEntityCollection, isValidEntity } from "./instanceGates";
import type { EntityCollection, Entity } from "cesium";

export const guardEntityCollection = (
  collection: EntityCollection,
  label?: string
) => {
  const isValid = () => isValidEntityCollection(collection);
  const ensure = <T>(fn: (ec: EntityCollection) => T, fallback: T): T => {
    if (!isValid()) {
      console.warn("EntityCollection gate invalid", label);
      return fallback;
    }
    try {
      return fn(collection as EntityCollection);
    } catch (e) {
      console.warn("EntityCollection gate call failed", label, e);
      return fallback;
    }
  };

  return {
    // Mutators (chainable)
    add(entity: unknown) {
      if (!isValidEntity(entity)) {
        console.warn("add: invalid entity", label, entity);
        return this;
      }
      ensure((ec) => ec.add(entity as Entity), undefined);
      return this;
    },
    remove(entity: unknown) {
      if (!isValidEntity(entity)) {
        console.warn("remove: invalid entity", label, entity);
        return this;
      }
      ensure((ec) => ec.remove(entity as Entity), undefined);
      return this;
    },
    removeById(id: string) {
      ensure((ec) => ec.removeById(id), undefined);
      return this;
    },
    removeAll() {
      ensure((ec) => ec.removeAll(), undefined);
      return this;
    },

    // Queries (non-throwing)
    contains(entity: unknown): boolean {
      if (!isValidEntity(entity)) {
        console.warn("contains: invalid entity", label, entity);
        return false;
      }
      return ensure((ec) => ec.contains(entity as Entity), false);
    },
    getById(id: string): Entity | undefined {
      return ensure((ec) => ec.getById(id) ?? undefined, undefined);
    },
  };
};
