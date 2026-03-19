import { createContext, useContext } from "react";
import type { UnknownAction } from "@reduxjs/toolkit";
import {
  createSelectorHook,
  type ReactReduxContextValue,
  type TypedUseSelectorHook,
} from "react-redux";

import type { ViewSyncState, ViewSyncStore } from "../core/types";

export const ViewSyncStoreContext = createContext<ViewSyncStore | null>(null);

export const ViewSyncReduxContext = createContext<ReactReduxContextValue<
  ViewSyncState,
  UnknownAction
> | null>(null);

export const useViewSyncStoreContextOptional = (): ViewSyncStore | null =>
  useContext(ViewSyncStoreContext);

export const useViewSyncReduxSelector = createSelectorHook(
  ViewSyncReduxContext
) as TypedUseSelectorHook<ViewSyncState>;
