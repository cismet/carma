import {
  createContext,
  useContext,
  useSyncExternalStore,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { Store, Dispatch, UnknownAction } from "redux";
import type { Layer } from "@carma/types";

export type APIRootState = Record<string, unknown>;

export interface AddLayerOptions {
  forceWMS?: boolean;
  visible?: boolean;
}

// Context value is the API surface that consumers use
export interface CarmaMapAPIContextValue {
  addLayerById: (
    id: string,
    options?: AddLayerOptions
  ) => Promise<Layer | undefined>;
  useHasLayerById: (id: string) => boolean;
  // Legacy Redux access (optional, only available when store is provided)
  store?: Store;
  dispatch?: Dispatch<UnknownAction>;
  getState?: () => APIRootState;
}

// Default no-op hook for useHasLayerById
const defaultUseHasLayerById = (_id: string): boolean => false;

// Default no-op implementation (graceful fallback for playgrounds)
const defaultContextValue: CarmaMapAPIContextValue = {
  addLayerById: async (id) => {
    console.warn(
      `CarmaMapAPIProvider: addLayerById("${id}") called but no implementation provided`
    );
    return undefined;
  },
  useHasLayerById: defaultUseHasLayerById,
};

const CarmaMapAPIContext =
  createContext<CarmaMapAPIContextValue>(defaultContextValue);

export interface CarmaMapAPIProviderProps<
  TState extends APIRootState = APIRootState
> {
  children: ReactNode;
  // New callback-based API (injected by consumer)
  addLayerById?: (
    id: string,
    options?: AddLayerOptions
  ) => Promise<Layer | undefined>;
  useHasLayerById?: (id: string) => boolean;
  // Legacy Redux store (for backward compatibility and selector/dispatch hooks)
  store?: Store<TState>;
}

export const CarmaMapAPIProvider = <
  TState extends APIRootState = APIRootState
>({
  children,
  addLayerById,
  useHasLayerById,
  store,
}: CarmaMapAPIProviderProps<TState>) => {
  const value: CarmaMapAPIContextValue = {
    addLayerById: addLayerById ?? defaultContextValue.addLayerById,
    useHasLayerById: useHasLayerById ?? defaultContextValue.useHasLayerById,
    store,
    dispatch: store?.dispatch,
    getState: store?.getState,
  };

  return (
    <CarmaMapAPIContext.Provider value={value}>
      {children}
    </CarmaMapAPIContext.Provider>
  );
};

// Internal hook to get context
const useCarmaMapAPI = (): CarmaMapAPIContextValue => {
  return useContext(CarmaMapAPIContext);
};

// Public hook to get actions
export const useCarmaMapAPIActions = () => {
  const { addLayerById } = useCarmaMapAPI();
  return { addLayerById };
};

// Public hook for checking if a layer exists (reactive)
export const useHasLayerById = (id: string): boolean => {
  const { useHasLayerById: contextHook } = useCarmaMapAPI();
  return contextHook(id);
};

// Legacy Redux-based hooks (backward compatibility)
export const useCarmaMapAPISelector = <TState extends APIRootState, TSelected>(
  selector: (state: TState) => TSelected
): TSelected => {
  const { store } = useCarmaMapAPI();

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      store?.subscribe(onStoreChange) ?? (() => {}),
    [store]
  );

  const getSnapshot = useCallback(
    () => selector((store?.getState() ?? {}) as TState),
    [store, selector]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useCarmaMapAPIDispatch = <
  TDispatch extends Dispatch<UnknownAction> = Dispatch<UnknownAction>
>(): TDispatch | undefined => {
  const { dispatch } = useCarmaMapAPI();
  return dispatch as TDispatch | undefined;
};

// Selector factories for common patterns (used by CarmaMapProviderWrapper)
export const createLayerSelectors = {
  getLayerById: (id: string) => (state: APIRootState) => {
    const allLayers =
      (
        state?.mapLayers as {
          allLayers?: Array<{ layers?: Array<{ id: string }> }>;
        }
      )?.allLayers ?? [];
    for (const category of allLayers) {
      const found = category.layers?.find((layer) => layer.id === id);
      if (found) return found;
    }
    return undefined;
  },

  hasLayerById: (id: string) => (state: APIRootState) =>
    (state?.mapping as { layers?: Array<{ id: string }> })?.layers?.some(
      (layer) => layer.id === id
    ) ?? false,

  getLayersByIds: (ids: string[]) => (state: APIRootState) =>
    (state?.mapping as { layers?: Array<{ id: string }> })?.layers?.filter(
      (layer) => ids.includes(layer.id)
    ) ?? [],
};
