import { createElement, useRef, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { createViewSyncStore } from "../core/createViewSyncStore";
import type { ViewSyncState, ViewSyncStore } from "../core/types";
import {
  ViewSyncReduxContext,
  ViewSyncStoreContext,
} from "./ViewSyncStoreContext";

type ViewSyncReduxProviderProps = {
  store: ViewSyncStore;
  context: typeof ViewSyncReduxContext;
  children?: ReactNode;
};

const ViewSyncReduxProvider = ReduxProvider as unknown as (
  props: ViewSyncReduxProviderProps
) => ReactNode;

type ViewSyncProviderProps = {
  children: ReactNode;
  store?: ViewSyncStore;
  initialState?: Partial<ViewSyncState>;
};

export const ViewSyncProvider = ({
  children,
  store,
  initialState,
}: ViewSyncProviderProps) => {
  const internalStoreRef = useRef<ViewSyncStore | null>(null);

  if (!store && !internalStoreRef.current) {
    internalStoreRef.current = createViewSyncStore(initialState);
  }

  const resolvedStore = store ?? internalStoreRef.current;

  if (!resolvedStore) {
    throw new Error("ViewSyncProvider could not initialize a Redux store");
  }

  return createElement(
    ViewSyncStoreContext.Provider,
    { value: resolvedStore },
    createElement(
      ViewSyncReduxProvider,
      {
        context: ViewSyncReduxContext,
        store: resolvedStore,
      },
      children
    )
  );
};
