import {
  createContext,
  useContext,
  useSyncExternalStore,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { Store, Dispatch, UnknownAction } from "redux";
import { parseToMapLayer } from "../helper/utils";

export type APIRootState = Record<string, unknown>;

interface CarmaMapAPIContextValue<
  TState extends APIRootState = APIRootState,
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
> {
  store: Store<TState>;
  dispatch: TDispatch;
  getState: () => TState;
}

const CarmaMapAPIContext = createContext<CarmaMapAPIContextValue | undefined>(
  undefined
);

interface CarmaMapAPIProviderProps<TState extends APIRootState = APIRootState> {
  children: ReactNode;
  store?: Store<TState>;
}

export const CarmaMapAPIProvider = <
  TState extends APIRootState = APIRootState
>({
  children,
  store,
}: CarmaMapAPIProviderProps<TState>) => {
  const value: CarmaMapAPIContextValue<TState> = {
    store,
    dispatch: store?.dispatch,
    getState: store?.getState,
  };

  return (
    <CarmaMapAPIContext.Provider value={value as CarmaMapAPIContextValue}>
      {children}
    </CarmaMapAPIContext.Provider>
  );
};

const useCarmaMapAPI = <
  TState extends APIRootState = APIRootState,
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
>(): CarmaMapAPIContextValue<TState, TDispatch> => {
  const context = useContext(CarmaMapAPIContext);
  if (context === undefined) {
    throw new Error("useCarmaMapAPI must be used within a CarmaMapAPIProvider");
  }
  return context as CarmaMapAPIContextValue<TState, TDispatch>;
};

export const useCarmaMapAPISelector = <TState extends APIRootState, TSelected>(
  selector: (state: TState) => TSelected
): TSelected => {
  const { store } = useCarmaMapAPI<TState>();

  const subscribe = useCallback(
    (onStoreChange: () => void) => store?.subscribe(onStoreChange),
    [store]
  );

  const getSnapshot = useCallback(
    () => selector(store?.getState()),
    [store, selector]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useCarmaMapAPIDispatch = <
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
>(): TDispatch => {
  const { dispatch } = useCarmaMapAPI<APIRootState, TDispatch>();
  return dispatch;
};

// Selector factories for common patterns (no geoportal imports needed)
export const createLayerSelectors = {
  getLayerById: (id: string) => (state: any) => {
    const allLayers = state?.mapLayers?.allLayers ?? [];
    for (const category of allLayers) {
      const found = category.layers?.find((layer: any) => layer.id === id);
      if (found) return found;
    }
    return undefined;
  },

  hasLayerById: (id: string) => (state: any) =>
    state?.mapping?.layers?.some((layer: any) => layer.id === id) ?? false,

  getLayersByIds: (ids: string[]) => (state: any) =>
    state?.mapping?.layers?.filter((layer: any) => ids.includes(layer.id)) ??
    [],
};

// Hook that provides actions to manipulate the portal map state
export const useCarmaMapAPIActions = () => {
  const { dispatch, getState } = useCarmaMapAPI();

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
