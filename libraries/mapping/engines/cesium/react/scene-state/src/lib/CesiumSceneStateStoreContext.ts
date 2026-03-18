import { createContext, useContext, useMemo } from "react";
import type { UnknownAction } from "@reduxjs/toolkit";
import {
  createSelectorHook,
  type ReactReduxContextValue,
  type TypedUseSelectorHook,
} from "react-redux";
import type {
  CesiumSceneStateStore,
  CesiumSceneStateStoreState,
} from "./utils/createCesiumSceneStateStore";

export const CesiumSceneStateStoreContext =
  createContext<CesiumSceneStateStore | null>(null);

export const CesiumSceneStateReduxContext = createContext<
  ReactReduxContextValue<CesiumSceneStateStoreState, UnknownAction> | null
>(null);

export const useCesiumSceneStateReduxSelector =
  createSelectorHook(
    CesiumSceneStateReduxContext
  ) as TypedUseSelectorHook<CesiumSceneStateStoreState>;

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
