import { useContext, useLayoutEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useCesiumContext } from "@carma-mapping/engines/cesium/legacy";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { Cartesian3 } from "@carma-cesium";
import { parseToMapLayer } from "@carma-mapping/utils";
import { registerMapping, type MapAdapter } from "@carma-api";

import type { Store } from "redux";

const RAD_TO_DEG = 180 / Math.PI;

export interface MappingPortalState {
  /** The full layer catalog, grouped into categories (source for addLayer). */
  mapLayers?: {
    allLayers?: Array<{
      layers?: Array<{ id: string; [key: string]: unknown }>;
    }>;
  };
  /** The layers currently on the map. */
  mapping?: {
    layers?: Array<{ id: string }>;
  };
  [key: string]: unknown;
}

/** True when a layer with the given id is currently on the map. */
export const hasLayerById = (state: MappingPortalState, id: string): boolean =>
  state.mapping?.layers?.some((layer) => layer.id === id) ?? false;

/** IDs of the layers currently on the map, in order. */
export const selectLayerIDs = (state: MappingPortalState): string[] =>
  state.mapping?.layers?.map((layer) => layer.id) ?? [];

/** Look a layer up in the full catalog by id, or `undefined` if unknown. */
export const selectCatalogLayerById = (
  state: MappingPortalState,
  id: string
): { id: string; [key: string]: unknown } | undefined => {
  for (const category of state.mapLayers?.allLayers ?? []) {
    const found = category.layers?.find((layer) => layer.id === id);
    if (found) return found;
  }
  return undefined;
};

/**
 * Registers the `carma.mapping` / `carma.mapping2D` / `carma.mapping3D`
 * adapter. Grabs the leaflet map (TopicMapContext), the cesium viewer and the
 * framework switcher, plus the optional Redux store for layer reads/mutations.
 *
 * To add a mapping function: extend `MapAdapter` in `@carma-api`, then add the
 * closure to the adapter object below.
 */
export const useMappingAdapter = (store?: Store<MappingPortalState>): void => {
  const topicMap = useContext<typeof TopicMapContext>(TopicMapContext);
  const { viewerRef } = useCesiumContext();
  const {
    activeFramework,
    requestTransitionToCesium,
    requestTransitionToLeaflet,
  } = useMapFrameworkSwitcherContext();

  useLayoutEffect(() => {
    // Live engine handles, resolved per call so they track mount/unmount.
    const getLeafletMap = () =>
      topicMap?.routedMapRef?.leafletMap?.leafletElement ?? null;
    const getCamera = () => {
      const viewer = viewerRef?.current;
      if (!viewer || viewer.isDestroyed()) return null;
      return viewer.camera;
    };

    const adapter: MapAdapter = {
      getMode: () =>
        activeFramework === "cesium"
          ? "3d"
          : activeFramework === "leaflet"
          ? "2d"
          : null,
      setMode: (mode) => {
        if (mode === "3d") void requestTransitionToCesium();
        else void requestTransitionToLeaflet();
      },

      // 2d (leaflet) ---------------------------------------------------------
      getPosition2D: () => {
        const map = getLeafletMap();
        if (!map) return null;
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
      },
      zoomIn2D: () => {
        getLeafletMap()?.zoomIn();
      },
      zoomOut2D: () => {
        getLeafletMap()?.zoomOut();
      },
      flyTo2D: (lat, lng, zoom) => {
        const map = getLeafletMap();
        if (!map) return;
        map.flyTo([lat, lng], zoom ?? 18);
      },

      // 3d (cesium) ----------------------------------------------------------
      getCameraPosition3D: () => {
        const camera = getCamera();
        if (!camera) return null;
        const p = camera.positionCartographic;
        return {
          lon: p.longitude * RAD_TO_DEG,
          lat: p.latitude * RAD_TO_DEG,
          height: p.height,
          heading: camera.heading * RAD_TO_DEG,
          pitch: camera.pitch * RAD_TO_DEG,
          roll: camera.roll * RAD_TO_DEG,
        };
      },
      zoomIn3D: () => getCamera()?.zoomIn(),
      zoomOut3D: () => getCamera()?.zoomOut(),
      flyTo3D: (lon, lat, height) => {
        const camera = getCamera();
        if (!camera) return;
        camera.flyTo({
          destination: Cartesian3.fromDegrees(
            lon,
            lat,
            height ?? camera.positionCartographic.height
          ),
        });
      },

      // layers (redux) — only available when a store was provided ------------
      ...(store && {
        hasLayer: (id: string): boolean => hasLayerById(store.getState(), id),
        getLayerIDs: (): string[] => selectLayerIDs(store.getState()),
        removeLayer: (id: string): boolean => {
          if (!hasLayerById(store.getState(), id)) {
            return false;
          }
          store.dispatch({ type: "mapping/removeLayer", payload: id });
          return true;
        },
        addLayer: async (id: string): Promise<boolean> => {
          const state = store.getState();
          if (hasLayerById(state, id)) {
            return false; // already on the map
          }
          const layer = selectCatalogLayerById(state, id);
          if (!layer) {
            return false; // unknown id
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapLayer = await parseToMapLayer(layer as any, false, true);
          store.dispatch({ type: "mapping/appendLayer", payload: mapLayer });
          return true;
        },
      }),
    };
    registerMapping(adapter);
    return () => registerMapping(null);
  }, [
    topicMap,
    viewerRef,
    activeFramework,
    requestTransitionToCesium,
    requestTransitionToLeaflet,
    store,
  ]);
};
