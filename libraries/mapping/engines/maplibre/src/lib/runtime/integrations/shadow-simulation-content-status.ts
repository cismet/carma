import type { Map as MaplibreMap } from "maplibre-gl";

import {
  getSharedThreeSceneStatus,
  subscribeSharedThreeSceneStatus,
} from "./shared-three-scene-registry";
import {
  genericThreeLayerHasShadeableContent,
  getGenericThreeLayers,
  subscribeGenericThreeLayers,
} from "./generic-three-layer-registry";

export type ShadowSimulationContentStatus = {
  /** Three.js geometry that can cast and receive the custom shadow map. */
  hasThreeShadowContent: boolean;
  /** Native MapLibre extrusions that react to MapLibre's light settings. */
  hasMapLibreLitExtrusions: boolean;
  available: boolean;
};

const hasVisibleMapLibreExtrusions = (map: MaplibreMap): boolean => {
  try {
    return Boolean(
      map.getStyle().layers?.some((layer) => {
        if (layer.type !== "fill-extrusion") return false;
        const visible =
          map.getLayoutProperty(layer.id, "visibility") !== "none";
        const opacity = map.getPaintProperty(
          layer.id,
          "fill-extrusion-opacity"
        );
        return visible && opacity !== 0;
      })
    );
  } catch {
    return false;
  }
};

const hasVisibleGenericThreeContent = (map: MaplibreMap): boolean =>
  getGenericThreeLayers(map).some((layer) => {
    try {
      if (!map.getLayer(layer.id)) return false;
      if (map.getLayoutProperty(layer.id, "visibility") === "none") {
        return false;
      }
    } catch {
      return false;
    }
    return genericThreeLayerHasShadeableContent(layer);
  });

export const getShadowSimulationContentStatus = (
  map: MaplibreMap
): ShadowSimulationContentStatus => {
  const threeStatus = getSharedThreeSceneStatus(map);
  const hasThreeShadowContent =
    (threeStatus.layerVisible && threeStatus.hasShadeableContent) ||
    hasVisibleGenericThreeContent(map);
  const hasMapLibreLitExtrusions = hasVisibleMapLibreExtrusions(map);
  return {
    hasThreeShadowContent,
    hasMapLibreLitExtrusions,
    available: hasThreeShadowContent || hasMapLibreLitExtrusions,
  };
};

export const subscribeShadowSimulationContentStatus = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const unsubscribeThree = subscribeSharedThreeSceneStatus(map, listener);
  const unsubscribeGenericThree = subscribeGenericThreeLayers(map, listener);
  map.on("styledata", listener);
  return () => {
    map.off("styledata", listener);
    unsubscribeGenericThree();
    unsubscribeThree();
  };
};
