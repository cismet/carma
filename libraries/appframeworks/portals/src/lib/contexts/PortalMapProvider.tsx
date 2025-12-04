import {
  createContext,
  useContext,
  useSyncExternalStore,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { Store, Dispatch, UnknownAction } from "redux";
import { parseToMapLayer } from "../utils/utils";

export type PortalRootState = Record<string, unknown>;

interface PortalMapContextValue<
  TState extends PortalRootState = PortalRootState,
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
> {
  store: Store<TState>;
  dispatch: TDispatch;
  getState: () => TState;
}

const PortalMapContext = createContext<PortalMapContextValue | undefined>(
  undefined
);

interface PortalMapProviderProps<
  TState extends PortalRootState = PortalRootState
> {
  children: ReactNode;
  store: Store<TState>;
}

export const PortalMapProvider = <
  TState extends PortalRootState = PortalRootState
>({
  children,
  store,
}: PortalMapProviderProps<TState>) => {
  const value: PortalMapContextValue<TState> = {
    store,
    dispatch: store.dispatch,
    getState: store.getState,
  };

  return (
    <PortalMapContext.Provider value={value as PortalMapContextValue}>
      {children}
    </PortalMapContext.Provider>
  );
};

const usePortalMap = <
  TState extends PortalRootState = PortalRootState,
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
>(): PortalMapContextValue<TState, TDispatch> => {
  const context = useContext(PortalMapContext);
  if (context === undefined) {
    throw new Error("usePortalMap must be used within a PortalMapProvider");
  }
  return context as PortalMapContextValue<TState, TDispatch>;
};

export const usePortalSelector = <TState extends PortalRootState, TSelected>(
  selector: (state: TState) => TSelected
): TSelected => {
  const { store } = usePortalMap<TState>();

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store]
  );

  const getSnapshot = useCallback(
    () => selector(store.getState()),
    [store, selector]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const usePortalDispatch = <
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
>(): TDispatch => {
  const { dispatch } = usePortalMap<PortalRootState, TDispatch>();
  return dispatch;
};

// Selector factories for common patterns (no geoportal imports needed)
export const createLayerSelectors = {
  getLayerById: (id: string) => (state: any) => {
    const allLayers = state.mapLayers?.allLayers ?? [];
    for (const category of allLayers) {
      const found = category.layers?.find((layer: any) => layer.id === id);
      if (found) return found;
    }
    return undefined;
  },

  hasLayerById: (id: string) => (state: any) =>
    state.mapping?.layers?.some((layer: any) => layer.id === id) ?? false,

  getLayersByIds: (ids: string[]) => (state: any) =>
    state.mapping?.layers?.filter((layer: any) => ids.includes(layer.id)) ?? [],
};

// Hook that provides actions to manipulate the portal map state
export const usePortalActions = () => {
  const { dispatch, getState } = usePortalMap();

  const addLayerById = useCallback(
    async (id: string, options?: { forceWMS?: boolean; visible?: boolean }) => {
      const { forceWMS = false, visible = true } = options ?? {};
      const state = getState();

      const layer = createLayerSelectors.getLayerById(id)(state);
      if (!layer) {
        console.warn(`Layer with id "${id}" not found`);
        return undefined;
      }

      const isAlreadyAdded = createLayerSelectors.hasLayerById(id)(state);
      if (isAlreadyAdded) {
        console.warn(`Layer with id "${id}" is already added to the map`);
        return undefined;
      }

      const mapLayer = await parseToMapLayer(layer, forceWMS, visible);

      dispatch({ type: "mapping/appendLayer", payload: mapLayer });

      return mapLayer;
    },
    [dispatch, getState]
  );

  return {
    addLayerById,
  };
};
