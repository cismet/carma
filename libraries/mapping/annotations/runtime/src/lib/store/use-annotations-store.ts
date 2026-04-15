import { createContext } from "react";
import {
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
  type ReactReduxContextValue,
  type TypedUseSelectorHook,
} from "react-redux";

import type { UnknownAction } from "@reduxjs/toolkit";

import type { AnnotationsStoreState } from "./annotations-store.types";
import type { AnnotationsStore } from "./create-annotations-store";
export const AnnotationsReduxContext = createContext<ReactReduxContextValue<
  AnnotationsStoreState,
  UnknownAction
> | null>(null);

const useAnnotationsReduxStore = createStoreHook<
  AnnotationsStoreState,
  UnknownAction
>(AnnotationsReduxContext);
const useAnnotationsReduxDispatch = createDispatchHook<
  AnnotationsStoreState,
  UnknownAction
>(AnnotationsReduxContext);
const useAnnotationsReduxSelector = createSelectorHook(
  AnnotationsReduxContext
) as TypedUseSelectorHook<AnnotationsStoreState>;

export const useAnnotationsStore = (hookName: string): AnnotationsStore => {
  const store = useAnnotationsReduxStore() as AnnotationsStore;

  if (!store) {
    throw new Error(`${hookName} must be used within a AnnotationsProvider`);
  }

  return store;
};

export const useAnnotationsSelector = <TSelected>(
  selector: (state: AnnotationsStoreState) => TSelected
) => useAnnotationsReduxSelector(selector);

export const useAnnotationsDispatch = () =>
  useAnnotationsReduxDispatch() as AnnotationsStore["dispatch"];
