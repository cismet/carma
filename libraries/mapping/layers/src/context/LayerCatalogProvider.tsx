import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { isEqual } from "lodash";

import type { ExtendedItem, Item } from "../lib/contracts/carma-layers.d";
import type { LayerCatalogConfig } from "../config/layerCatalogConfig";
import { wuppLayerCatalogConfig } from "../config/layerCatalogConfig";
import { LayerCatalogConfigProvider } from "../config/LayerCatalogConfigContext";
import { CatalogQueryProvider } from "../config/CatalogQueryProvider";

/** category tree derived from one WMS or local config service */
export interface CatalogServiceCategory {
  Title: string;
  id: string;
  layers: Item[];
}

interface CatalogState {
  serviceCategories: CatalogServiceCategory[];
  /** true until the first capabilities request settles */
  loadingCapabilities: boolean;
  /** ids of services whose capabilities are still on their initial fetch */
  loadingServiceIds: string[];
  replaceLayers: ExtendedItem[];
  selectedItem: Item | null;
  discoverRefetchRequested: boolean;
}

const initialState: CatalogState = {
  serviceCategories: [],
  loadingCapabilities: true,
  loadingServiceIds: [],
  replaceLayers: [],
  selectedItem: null,
  discoverRefetchRequested: false,
};

type CatalogAction =
  | { type: "serviceCategoriesDerived"; categories: CatalogServiceCategory[] }
  | {
      type: "capabilitiesLoadingChanged";
      loadingServiceIds: string[];
      loadingCapabilities: boolean;
    }
  | { type: "replaceLayerUpserted"; layer: ExtendedItem }
  | { type: "itemSelected"; item: Item | null }
  | { type: "discoverRefetchRequested" }
  | { type: "discoverRefetchHandled" };

// All branches must be idempotent: re-dispatching unchanged data returns the
// same state reference (React then skips the re-render), otherwise derivation
// effects depending on this state loop with host re-renders.
const catalogReducer = (
  state: CatalogState,
  action: CatalogAction
): CatalogState => {
  switch (action.type) {
    case "serviceCategoriesDerived": {
      const { categories } = action;
      if (state.serviceCategories.length === 0) {
        if (categories.length === 0) {
          return state;
        }
        return { ...state, serviceCategories: categories };
      }
      // merge per service: replace changed categories in place, insert new
      // ones at their payload position, keep categories missing from the
      // payload (a service answering later must not drop earlier results)
      let changed = false;
      const merged = [...state.serviceCategories];
      categories.forEach((category, index) => {
        if (!category.layers || category.layers.length === 0) {
          return;
        }
        const existingIndex = merged.findIndex(
          (existing) => existing.id === category.id
        );
        if (existingIndex !== -1) {
          if (!isEqual(merged[existingIndex], category)) {
            merged[existingIndex] = category;
            changed = true;
          }
        } else {
          if (index < merged.length) {
            merged.splice(index, 0, category);
          } else {
            merged.push(category);
          }
          changed = true;
        }
      });
      return changed ? { ...state, serviceCategories: merged } : state;
    }
    case "capabilitiesLoadingChanged": {
      const idsChanged = !isEqual(
        state.loadingServiceIds,
        action.loadingServiceIds
      );
      if (
        !idsChanged &&
        state.loadingCapabilities === action.loadingCapabilities
      ) {
        return state;
      }
      return {
        ...state,
        loadingServiceIds: idsChanged
          ? action.loadingServiceIds
          : state.loadingServiceIds,
        loadingCapabilities: action.loadingCapabilities,
      };
    }
    case "replaceLayerUpserted": {
      const existingIndex = state.replaceLayers.findIndex(
        (layer) => layer.id === action.layer.id
      );
      if (existingIndex === -1) {
        return {
          ...state,
          replaceLayers: [...state.replaceLayers, action.layer],
        };
      }
      if (isEqual(state.replaceLayers[existingIndex], action.layer)) {
        return state;
      }
      const replaceLayers = [...state.replaceLayers];
      replaceLayers[existingIndex] = action.layer;
      return { ...state, replaceLayers };
    }
    case "itemSelected":
      return state.selectedItem === action.item
        ? state
        : { ...state, selectedItem: action.item };
    case "discoverRefetchRequested":
      return state.discoverRefetchRequested
        ? state
        : { ...state, discoverRefetchRequested: true };
    case "discoverRefetchHandled":
      return state.discoverRefetchRequested
        ? { ...state, discoverRefetchRequested: false }
        : state;
  }
};

interface CatalogDataActions {
  setServiceCategories: (categories: CatalogServiceCategory[]) => void;
  setCapabilitiesLoading: (
    loadingServiceIds: string[],
    loadingCapabilities: boolean
  ) => void;
  upsertReplaceLayer: (layer: ExtendedItem) => void;
}

export interface CatalogDataContextValue extends CatalogDataActions {
  serviceCategories: CatalogServiceCategory[];
  loadingCapabilities: boolean;
  loadingServiceIds: string[];
  replaceLayers: ExtendedItem[];
}

interface CatalogSelectionActions {
  selectItem: (item: Item | null) => void;
  requestDiscoverRefetch: () => void;
  markDiscoverRefetchHandled: () => void;
}

export interface CatalogSelectionContextValue extends CatalogSelectionActions {
  selectedItem: Item | null;
  discoverRefetchRequested: boolean;
}

const CatalogDataContext = createContext<CatalogDataContextValue | null>(null);
const CatalogSelectionContext =
  createContext<CatalogSelectionContextValue | null>(null);

export const useCatalogData = (): CatalogDataContextValue => {
  const value = useContext(CatalogDataContext);
  if (!value) {
    throw new Error("useCatalogData requires a LayerCatalogProvider");
  }
  return value;
};

export const useCatalogSelection = (): CatalogSelectionContextValue => {
  const value = useContext(CatalogSelectionContext);
  if (!value) {
    throw new Error("useCatalogSelection requires a LayerCatalogProvider");
  }
  return value;
};

const CatalogStateProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(catalogReducer, initialState);

  // dispatch is stable, so the action callbacks stay identity-stable across
  // state changes and are safe to use in effect dependency lists
  const dataActions = useMemo<CatalogDataActions>(
    () => ({
      setServiceCategories: (categories) =>
        dispatch({ type: "serviceCategoriesDerived", categories }),
      setCapabilitiesLoading: (loadingServiceIds, loadingCapabilities) =>
        dispatch({
          type: "capabilitiesLoadingChanged",
          loadingServiceIds,
          loadingCapabilities,
        }),
      upsertReplaceLayer: (layer) =>
        dispatch({ type: "replaceLayerUpserted", layer }),
    }),
    []
  );
  const selectionActions = useMemo<CatalogSelectionActions>(
    () => ({
      selectItem: (item) => dispatch({ type: "itemSelected", item }),
      requestDiscoverRefetch: () =>
        dispatch({ type: "discoverRefetchRequested" }),
      markDiscoverRefetchHandled: () =>
        dispatch({ type: "discoverRefetchHandled" }),
    }),
    []
  );

  const dataValue = useMemo<CatalogDataContextValue>(
    () => ({
      serviceCategories: state.serviceCategories,
      loadingCapabilities: state.loadingCapabilities,
      loadingServiceIds: state.loadingServiceIds,
      replaceLayers: state.replaceLayers,
      ...dataActions,
    }),
    [
      state.serviceCategories,
      state.loadingCapabilities,
      state.loadingServiceIds,
      state.replaceLayers,
      dataActions,
    ]
  );
  const selectionValue = useMemo<CatalogSelectionContextValue>(
    () => ({
      selectedItem: state.selectedItem,
      discoverRefetchRequested: state.discoverRefetchRequested,
      ...selectionActions,
    }),
    [state.selectedItem, state.discoverRefetchRequested, selectionActions]
  );

  return (
    <CatalogDataContext.Provider value={dataValue}>
      <CatalogSelectionContext.Provider value={selectionValue}>
        {children}
      </CatalogSelectionContext.Provider>
    </CatalogDataContext.Provider>
  );
};

export interface LayerCatalogProviderProps {
  /** host-supplied catalog config; defaults to the Wuppertal preset */
  config?: LayerCatalogConfig;
  children: ReactNode;
}

export const LayerCatalogProvider = ({
  config,
  children,
}: LayerCatalogProviderProps) => (
  <LayerCatalogConfigProvider value={config ?? wuppLayerCatalogConfig}>
    <CatalogQueryProvider>
      <CatalogStateProvider>{children}</CatalogStateProvider>
    </CatalogQueryProvider>
  </LayerCatalogConfigProvider>
);
