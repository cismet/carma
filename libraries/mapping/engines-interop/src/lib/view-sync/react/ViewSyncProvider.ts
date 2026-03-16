import {
  createElement,
  useRef,
  type ReactNode,
} from "react";
import { createViewSyncStore } from "../core/createViewSyncStore";
import type { ViewSyncState, ViewSyncStore } from "../core/types";
import { ViewSyncStoreContext } from "./ViewSyncStoreContext";

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

  return createElement(
    ViewSyncStoreContext.Provider,
    { value: store ?? internalStoreRef.current },
    children
  );
};
