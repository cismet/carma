import { createContext, useContext, useMemo } from "react";
import type { CesiumSceneStateStore } from "./createCesiumSceneStateStore";

export const CesiumSceneStateStoreContext =
  createContext<CesiumSceneStateStore | null>(null);

export type CesiumSceneStateUpdateDriver = (
  updateFn: () => void
) => (() => void) | void;

const createSceneStateUpdateDriver = (
  store: CesiumSceneStateStore | null
): CesiumSceneStateUpdateDriver | undefined => {
  if (!store) return undefined;
  return (updateFn: () => void) => {
    updateFn();
    return store.subscribe(updateFn);
  };
};

export const useCesiumSceneStateUpdateDriverOptional = () => {
  const store = useContext(CesiumSceneStateStoreContext);
  return useMemo(() => createSceneStateUpdateDriver(store), [store]);
};

export const useCesiumSceneStateUpdateDriver = () => {
  const updateDriver = useCesiumSceneStateUpdateDriverOptional();
  if (!updateDriver) {
    throw new Error(
      "useCesiumSceneStateUpdateDriver must be used within CesiumSceneStateProvider"
    );
  }
  return updateDriver;
};
