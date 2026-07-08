import {
  createContext,
  useContext,
  useEffect,
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
import {
  buildFavoritesStorageKey,
  loadFavorites,
  persistFavorites,
} from "./favoritesStorage";
import type { CategoryDefinition } from "../config/categoryDefinitions";
import { defaultCategoryDefinitions } from "../config/categoryDefinitions";

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
  /** stored with a `fav_` id prefix, matching the persisted shape */
  favorites: Item[];
  /** false until the persisted favorites finished loading */
  favoritesReady: boolean;
}

const initialState: CatalogState = {
  serviceCategories: [],
  loadingCapabilities: true,
  loadingServiceIds: [],
  replaceLayers: [],
  selectedItem: null,
  discoverRefetchRequested: false,
  favorites: [],
  favoritesReady: false,
};

const isFavoriteOf = (favorite: Item, item: Item) =>
  favorite.id === `fav_${item.id}` || favorite.id === item.id;

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
  | { type: "discoverRefetchHandled" }
  | { type: "favoritesLoaded"; favorites: Item[] }
  | { type: "favoriteAdded"; item: Item }
  | { type: "favoriteRemoved"; item: Item }
  | { type: "favoriteUpdated"; item: Item };

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
    case "favoritesLoaded": {
      // favorites added before the async load finished win over stored ones
      const merged = [...action.favorites];
      state.favorites.forEach((favorite) => {
        const index = merged.findIndex((entry) => entry.id === favorite.id);
        if (index === -1) {
          merged.push(favorite);
        } else {
          merged[index] = favorite;
        }
      });
      return { ...state, favorites: merged, favoritesReady: true };
    }
    case "favoriteAdded": {
      if (
        state.favorites.some((favorite) => isFavoriteOf(favorite, action.item))
      ) {
        return state;
      }
      return {
        ...state,
        favorites: [
          ...state.favorites,
          { ...action.item, id: `fav_${action.item.id}` },
        ],
      };
    }
    case "favoriteRemoved": {
      const favorites = state.favorites.filter(
        (favorite) => !isFavoriteOf(favorite, action.item)
      );
      return favorites.length === state.favorites.length
        ? state
        : { ...state, favorites };
    }
    case "favoriteUpdated": {
      let changed = false;
      const favorites = state.favorites.map((favorite) => {
        if (favorite.id !== `fav_${action.item.id}`) {
          return favorite;
        }
        const updated = { ...action.item, id: `fav_${action.item.id}` };
        if (isEqual(favorite, updated)) {
          return favorite;
        }
        changed = true;
        return updated;
      });
      return changed ? { ...state, favorites } : state;
    }
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

interface CatalogFavoritesActions {
  addFavorite: (item: Item) => void;
  removeFavorite: (item: Item) => void;
  updateFavorite: (item: Item) => void;
}

export interface LayerCatalogContextValue extends CatalogFavoritesActions {
  /** favorited items, ids carry the `fav_` prefix */
  favorites: Item[];
  /** false until the persisted favorites finished loading */
  favoritesReady: boolean;
}

const CatalogDataContext = createContext<CatalogDataContextValue | null>(null);
const CatalogSelectionContext =
  createContext<CatalogSelectionContextValue | null>(null);
const CatalogFavoritesContext = createContext<LayerCatalogContextValue | null>(
  null
);
const CatalogCategoriesContext = createContext<CategoryDefinition[]>(
  defaultCategoryDefinitions
);

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

/** host-facing catalog API (favorites for now, grows with phase 3) */
export const useLayerCatalog = (): LayerCatalogContextValue => {
  const value = useContext(CatalogFavoritesContext);
  if (!value) {
    throw new Error("useLayerCatalog requires a LayerCatalogProvider");
  }
  return value;
};

/** lets LayerCatalog reuse a host-mounted provider instead of nesting one */
export const useIsInsideLayerCatalogProvider = () =>
  useContext(CatalogDataContext) !== null;

/** the main category registry (sidebar entries + tree assembly order) */
export const useCategoryDefinitions = () =>
  useContext(CatalogCategoriesContext);

interface CatalogStateProviderProps {
  favoritesStorageKey: string;
  legacyFavoritesKey?: string;
  children: ReactNode;
}

const CatalogStateProvider = ({
  favoritesStorageKey,
  legacyFavoritesKey,
  children,
}: CatalogStateProviderProps) => {
  const [state, dispatch] = useReducer(catalogReducer, initialState);

  useEffect(() => {
    let cancelled = false;
    loadFavorites(favoritesStorageKey, legacyFavoritesKey).then((favorites) => {
      if (!cancelled) {
        dispatch({ type: "favoritesLoaded", favorites });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [favoritesStorageKey, legacyFavoritesKey]);

  // The first write after loading claims the key, so the legacy import never
  // runs again, even when the user removes every favorite afterwards.
  useEffect(() => {
    if (!state.favoritesReady) {
      return;
    }
    persistFavorites(favoritesStorageKey, state.favorites);
  }, [state.favorites, state.favoritesReady, favoritesStorageKey]);

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
  const favoritesActions = useMemo<CatalogFavoritesActions>(
    () => ({
      addFavorite: (item) => dispatch({ type: "favoriteAdded", item }),
      removeFavorite: (item) => dispatch({ type: "favoriteRemoved", item }),
      updateFavorite: (item) => dispatch({ type: "favoriteUpdated", item }),
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
  const favoritesValue = useMemo<LayerCatalogContextValue>(
    () => ({
      favorites: state.favorites,
      favoritesReady: state.favoritesReady,
      ...favoritesActions,
    }),
    [state.favorites, state.favoritesReady, favoritesActions]
  );

  return (
    <CatalogDataContext.Provider value={dataValue}>
      <CatalogSelectionContext.Provider value={selectionValue}>
        <CatalogFavoritesContext.Provider value={favoritesValue}>
          {children}
        </CatalogFavoritesContext.Provider>
      </CatalogSelectionContext.Provider>
    </CatalogDataContext.Provider>
  );
};

export interface LayerCatalogProviderProps {
  /** host-supplied catalog config; defaults to the Wuppertal preset */
  config?: LayerCatalogConfig;
  /** main category registry override; defaults to the standard categories */
  categories?: CategoryDefinition[];
  /** app identity for the favorites localforage key; avoids cross-app bleed */
  appKey?: string;
  storagePrefix?: string;
  /**
   * localforage key of a redux-persist record to import favorites from ONCE:
   * only consulted while the lib's own favorites key was never written
   */
  legacyFavoritesKey?: string;
  children: ReactNode;
}

export const LayerCatalogProvider = ({
  config,
  categories = defaultCategoryDefinitions,
  appKey = "carma",
  storagePrefix = "defaultStorage",
  legacyFavoritesKey,
  children,
}: LayerCatalogProviderProps) => (
  <LayerCatalogConfigProvider value={config ?? wuppLayerCatalogConfig}>
    <CatalogCategoriesContext.Provider value={categories}>
      <CatalogQueryProvider>
        <CatalogStateProvider
          favoritesStorageKey={buildFavoritesStorageKey(appKey, storagePrefix)}
          legacyFavoritesKey={legacyFavoritesKey}
        >
          {children}
        </CatalogStateProvider>
      </CatalogQueryProvider>
    </CatalogCategoriesContext.Provider>
  </LayerCatalogConfigProvider>
);
