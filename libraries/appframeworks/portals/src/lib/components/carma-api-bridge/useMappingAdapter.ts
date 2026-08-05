import { useContext, useLayoutEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useLibreContext } from "@carma-mapping/contexts";
import { Cartesian3 } from "@carma-cesium";
import { parseToMapLayer } from "@carma-mapping/utils";
import {
  useCatalogDataOptional,
  type CatalogServiceCategory,
  type Item,
} from "@carma-mapping/layers";
import { registerMapping, type MapAdapter } from "@carma-api";

import { useMapStyle } from "../../contexts/MapStyleProvider";
import type { BackgroundLayerCatalogEntry } from "../../types";

import type { Store } from "redux";

const RAD_TO_DEG = 180 / Math.PI;

export interface MappingPortalState {
  /** The layers currently on the map. */
  mapping?: {
    layers?: Array<{ id: string }>;
    backgroundLayers?: BackgroundLayerCatalogEntry[];
  };
  [key: string]: unknown;
}

/** True when a layer with the given id is currently on the map. */
export const hasLayerById = (state: MappingPortalState, id: string): boolean =>
  state.mapping?.layers?.some((layer) => layer.id === id) ?? false;

/** IDs of the layers currently on the map, in order. */
export const selectLayerIDs = (state: MappingPortalState): string[] =>
  state.mapping?.layers?.map((layer) => layer.id) ?? [];

/** Look a layer up in the catalog's service categories by id, or `undefined`. */
export const findCatalogItemById = (
  categories: CatalogServiceCategory[],
  id: string
): Item | undefined => {
  for (const category of categories) {
    const found = category.layers.find((layer) => layer.id === id);
    if (found) return found;
  }
  return undefined;
};

/**
 * Registers the `carma.mapping` / `carma.mapping2D` / `carma.mapping3D`
 * adapter. Grabs the leaflet map (TopicMapContext), the cesium viewer and the
 * framework switcher, plus the optional Redux store for the active-layer state.
 * Catalog lookups (`addLayer` id resolution) read the LayerCatalogProvider,
 * when one is mounted above.
 *
 * To add a mapping function: extend `MapAdapter` in `@carma-api`, then add the
 * closure to the adapter object below.
 */
export const useMappingAdapter = (store?: Store<MappingPortalState>): void => {
  const topicMap = useContext<typeof TopicMapContext>(TopicMapContext);
  const { withCamera } = useCesiumContext();
  const { setCurrentStyle } = useMapStyle();
  const serviceCategories = useCatalogDataOptional()?.serviceCategories;
  const {
    activeFramework,
    requestTransitionToCesium,
    requestTransitionToLeaflet,
  } = useMapFrameworkSwitcherContext();
  const { map: libreMap } = useLibreContext();

  useLayoutEffect(() => {
    // Live engine handles, resolved per call so they track mount/unmount.
    const getLeafletMap = () =>
      topicMap?.routedMapRef?.leafletMap?.leafletElement ?? null;

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
        // `zoom` is on the Leaflet scale, which MapLibre trails by one
        if (libreMap) {
          libreMap.flyTo({ center: [lng, lat], zoom: (zoom ?? 18) - 1 });
          return;
        }
        const map = getLeafletMap();
        if (!map) return;
        map.flyTo([lat, lng], zoom ?? 18);
      },
      fitBounds2D: (minLng, minLat, maxLng, maxLat) => {
        if (libreMap) {
          libreMap.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding: 40 }
          );
          return true;
        }
        const map = getLeafletMap();
        if (!map) {
          return false;
        }
        map.fitBounds([
          [minLat, minLng],
          [maxLat, maxLng],
        ]);
        return true;
      },

      // 3d (cesium) ----------------------------------------------------------
      getCameraPosition3D: () =>
        withCamera((camera) => {
          const p = camera.positionCartographic;
          return {
            lon: p.longitude * RAD_TO_DEG,
            lat: p.latitude * RAD_TO_DEG,
            height: p.height,
            heading: camera.heading * RAD_TO_DEG,
            pitch: camera.pitch * RAD_TO_DEG,
            roll: camera.roll * RAD_TO_DEG,
          };
        }) ?? null,
      zoomIn3D: () => {
        withCamera((camera) => camera.zoomIn());
      },
      zoomOut3D: () => {
        withCamera((camera) => camera.zoomOut());
      },
      flyTo3D: (lon, lat, height) => {
        withCamera((camera) => {
          camera.flyTo({
            destination: Cartesian3.fromDegrees(
              lon,
              lat,
              height ?? camera.positionCartographic.height
            ),
          });
        });
      },

      // layers — active-layer state lives in redux (needs the store), the
      // catalog for addLayer id resolution comes from the LayerCatalogProvider
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
        setLayerVisibility: (id: string, visible: boolean): boolean => {
          store.dispatch({
            type: "mapping/changeVisibility",
            payload: { id, visible },
          });
          return true;
        },
        addLayer: async (id: string): Promise<boolean> => {
          if (hasLayerById(store.getState(), id)) {
            return false; // already on the map
          }
          const item = findCatalogItemById(serviceCategories ?? [], id);
          if (!item) {
            return false; // unknown id, or no LayerCatalogProvider mounted
          }
          const mapLayer = await parseToMapLayer(item, false, true);
          store.dispatch({ type: "mapping/appendLayer", payload: mapLayer });
          return true;
        },
        getBackgroundLayers: () =>
          (store.getState().mapping?.backgroundLayers ?? []).map(
            ({ id, title, group }) => ({ id, title, group })
          ),
        setBackgroundLayer: (id: string): boolean => {
          const entry = (store.getState().mapping?.backgroundLayers ?? []).find(
            (candidate) => candidate.id === id
          );
          if (!entry) {
            return false;
          }
          // Mirror BaseLayerSelection/AerialLayerSelection: remember the chosen
          // variant for its group, set it as the active background (id is the
          // group key), then flip the map style.
          store.dispatch({
            type:
              entry.group === "luftbild"
                ? "mapping/setSelectedLuftbildLayer"
                : "mapping/setSelectedMapLayer",
            payload: entry.config,
          });
          store.dispatch({
            type: "mapping/setBackgroundLayer",
            payload: { ...entry.config, id: entry.group },
          });
          setCurrentStyle(entry.style);
          return true;
        },
      }),
    };
    registerMapping(adapter);
    return () => registerMapping(null);
  }, [
    topicMap,
    withCamera,
    activeFramework,
    requestTransitionToCesium,
    requestTransitionToLeaflet,
    setCurrentStyle,
    store,
    serviceCategories,
    libreMap,
  ]);
};
