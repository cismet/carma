import { useContext, useLayoutEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useCesiumContext } from "@carma-mapping/engines/cesium/legacy";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { registerMapping, type MapAdapter } from "@carma-api";

import type { Store } from "redux";

const RAD_TO_DEG = 180 / Math.PI;

export interface MappingPortalState {
  mapping?: {
    layers?: Array<{ id: string }>;
  };
  [key: string]: unknown;
}

export const hasLayerById = (state: MappingPortalState, id: string): boolean =>
  state.mapping?.layers?.some((layer) => layer.id === id) ?? false;

export const selectLayerIDs = (state: MappingPortalState): string[] =>
  state.mapping?.layers?.map((layer) => layer.id) ?? [];

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
    const adapter: MapAdapter = {
      getMode: () =>
        activeFramework === "cesium"
          ? "3d"
          : activeFramework === "leaflet"
          ? "2d"
          : null,
      getPosition2D: () => {
        const map = topicMap?.routedMapRef?.leafletMap?.leafletElement;
        if (!map) return null;
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
      },
      getCameraPosition3D: () => {
        const viewer = viewerRef?.current;
        if (!viewer || viewer.isDestroyed()) return null;
        const { camera } = viewer;
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
      setMode: (mode) => {
        if (mode === "3d") void requestTransitionToCesium();
        else void requestTransitionToLeaflet();
      },
      ...(store && {
        removeLayer: (id: string): boolean => {
          if (!hasLayerById(store.getState(), id)) {
            return false;
          }
          store.dispatch({ type: "mapping/removeLayer", payload: id });
          return true;
        },
        getLayerIDs: (): string[] => selectLayerIDs(store.getState()),
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
