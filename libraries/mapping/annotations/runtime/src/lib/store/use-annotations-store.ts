import { createContext } from "react";
import {
  createDispatchHook,
  createSelectorHook,
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

const useAnnotationsReduxDispatch = createDispatchHook<
  AnnotationsStoreState,
  UnknownAction
>(AnnotationsReduxContext);
const useAnnotationsReduxSelector = createSelectorHook(
  AnnotationsReduxContext
) as TypedUseSelectorHook<AnnotationsStoreState>;

export const useAnnotationsSelector = <TSelected>(
  selector: (state: AnnotationsStoreState) => TSelected
) => useAnnotationsReduxSelector(selector);

export const useAnnotationsDispatch = () =>
  useAnnotationsReduxDispatch() as AnnotationsStore["dispatch"];
