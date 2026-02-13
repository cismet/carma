import { useCallback, useMemo, useSyncExternalStore } from "react";
import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import {
  LibreContextProvider,
  MapSelectionProvider,
} from "@carma-mapping/contexts";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { GazDataProvider } from "./GazDataProvider";
import { AdhocFeatureDisplayProvider } from "./AdhocFeatureDisplayProvider";
import { SelectionProvider } from "./SelectionProvider";
import {
  MapStyleProvider,
  type MapStyleConfig,
} from "../contexts/MapStyleProvider";
import type { GazDataConfig } from "@carma-commons/utils";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { parseToMapLayer } from "@carma-mapping/utils";
import { AuthProvider } from "@carma-providers/auth";

import type { HashCodecs } from "@carma-providers/hash-state";
import {
  CarmaMapAPIProvider,
  type AddLayerOptions,
} from "@carma-mapping/carma-map-api";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";

import type { Store } from "redux";
import type { Layer } from "@carma/types";

// Selector factories for layer state operations
const createLayerSelectors = {
  getLayerById: (id: string) => (state: PortalRootState) => {
    const allLayers = state?.mapLayers?.allLayers ?? [];
    for (const category of allLayers) {
      const found = category.layers?.find(
        (layer: { id: string }) => layer.id === id
      );
      if (found) return found;
    }
    return undefined;
  },

  hasLayerById: (id: string) => (state: PortalRootState) =>
    state?.mapping?.layers?.some((layer: { id: string }) => layer.id === id) ??
    false,
};

// Type for the portal Redux state shape (extends APIRootState for compatibility)
interface PortalRootState {
  mapLayers?: {
    allLayers?: Array<{
      layers?: Array<{ id: string; [key: string]: unknown }>;
    }>;
  };
  mapping?: {
    layers?: Array<{ id: string }>;
  };
  [key: string]: unknown; // Index signature for APIRootState compatibility
}

type CarmaMapProviderWrapperProps = {
  children: React.ReactNode;
  overlayOptions: { background: { transparency: number; color: string } };
  cesiumOptions: { providerConfig: unknown; tilesetConfigs: unknown };
  gazDataConfig?: GazDataConfig;
  mapStyleConfig: MapStyleConfig;
  /** Redux store instance from the app for cross-library state access */
  store?: Store<PortalRootState>;
  /** @deprecated HashStateProvider should be placed higher in the tree. These props are ignored. */
  hashKeyAliases?: Record<string, string>;
  /** @deprecated HashStateProvider should be placed higher in the tree. These props are ignored. */
  hashCodecs?: HashCodecs;
  /** @deprecated HashStateProvider should be placed higher in the tree. These props are ignored. */
  keyOrder?: string[];
  topicMapConfig?: {
    appKey?: string;
    featureItemsURL?: string;
    referenceSystemDefinition?: unknown;
    mapEPSGCode?: string;
    referenceSystem?: unknown;
    getFeatureStyler?: unknown;
    featureTooltipFunction?: unknown;
    convertItemToFeature?: unknown;
    clusteringOptions?: unknown;
  };
};

/**
 * Creates a hook factory for useHasLayerById that uses useSyncExternalStore.
 * This is defined outside the component to avoid recreating on each render.
 */
const createUseHasLayerById =
  (store: Store<PortalRootState>) =>
  (id: string): boolean => {
    // These callbacks need to be stable for useSyncExternalStore
    // We can't use useCallback here since this is called as a hook by consumers
    const subscribe = (onStoreChange: () => void) =>
      store.subscribe(onStoreChange);
    const getSnapshot = () =>
      createLayerSelectors.hasLayerById(id)(store.getState());

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  };

/**
 * Internal component that provides Redux-backed implementations to CarmaMapAPIProvider.
 * This is separated to ensure hooks are used correctly within a component.
 */
const CarmaMapAPIWithRedux = ({
  children,
  store,
}: {
  children: React.ReactNode;
  store: Store<PortalRootState>;
}) => {
  // Create Redux-backed addLayerById implementation
  const addLayerById = useCallback(
    async (
      id: string,
      options?: AddLayerOptions
    ): Promise<Layer | undefined> => {
      const { forceWMS = false, visible = true } = options ?? {};
      const state = store.getState();

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapLayer = await parseToMapLayer(layer as any, forceWMS, visible);

      store.dispatch({ type: "mapping/appendLayer", payload: mapLayer });

      return mapLayer;
    },
    [store]
  );

  // Create stable useHasLayerById hook using the factory
  // useMemo ensures we don't create a new hook function on every render
  const useHasLayerById = useMemo(() => createUseHasLayerById(store), [store]);

  return (
    <CarmaMapAPIProvider
      addLayerById={addLayerById}
      useHasLayerById={useHasLayerById}
      store={store}
    >
      {children}
    </CarmaMapAPIProvider>
  );
};

export const CarmaMapProviderWrapper = ({
  children,
  overlayOptions,
  cesiumOptions,
  gazDataConfig = defaultGazDataConfig,
  mapStyleConfig,
  topicMapConfig = {},
  store,
}: CarmaMapProviderWrapperProps) => {
  const { background } = overlayOptions;
  const { transparency, color } = background;

  if (gazDataConfig.crs !== "3857") {
    console.warn(
      "Gazetteer data CRS is not supported, it should be 3857, Spherical Mercator"
    );
  }

  // Wrap children with CarmaMapAPIProvider (with or without Redux)
  const wrappedChildren = store ? (
    <CarmaMapAPIWithRedux store={store}>{children}</CarmaMapAPIWithRedux>
  ) : (
    <CarmaMapAPIProvider>{children}</CarmaMapAPIProvider>
  );

  return (
    <AuthProvider>
      <SandboxedEvalProvider>
        <GazDataProvider config={gazDataConfig}>
          <SelectionProvider>
            <MapStyleProvider config={mapStyleConfig}>
              <TopicMapContextProvider
                infoBoxPixelWidth={350}
                {...topicMapConfig}
              >
                <OverlayTourProvider transparency={transparency} color={color}>
                  <CesiumContextProvider
                    //initialViewerState={defaultCesiumState}
                    // TODO move these to store/slice setup ?
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    providerConfig={cesiumOptions.providerConfig as any}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    tilesetConfigs={cesiumOptions.tilesetConfigs as any}
                  >
                    <LibreContextProvider>
                      <MapSelectionProvider>
                        {wrappedChildren}
                      </MapSelectionProvider>
                    </LibreContextProvider>
                  </CesiumContextProvider>
                </OverlayTourProvider>
              </TopicMapContextProvider>
            </MapStyleProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </AuthProvider>
  );
};

export default CarmaMapProviderWrapper;
