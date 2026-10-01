import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  applyAddonOverrides,
  conditionRouteOf,
  isShownByCondition,
  resolveAddonEntries,
  useAddonState,
  usePersistedAddonOverrides,
  useRouteAddons,
} from "@carma-mapping/addons";
import type { LibreLayer } from "@carma-mapping/core";

import { geoportalBackgroundToLibreLayers } from "../../components/GeoportalMap/geoportalBackgroundToLibreLayers";
import {
  geoportalLayersToLibreLayers,
  isAppOwnedLayer,
  layerIsStandaloneMesh,
} from "../../components/GeoportalMap/geoportalLayersToLibreLayers";
import { backgroundConfig } from "../../config/backgroundConfig";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { namedLayers } = backgroundConfig;
  const [shadowState] = useAddonState("shadowSimulation");
  const routeAddons = useRouteAddons();
  const [addonOverrides] = usePersistedAddonOverrides();
  const mapStyle3dEntry = useMemo(
    () =>
      applyAddonOverrides(
        resolveAddonEntries(routeAddons),
        addonOverrides
      ).find((entry) => entry.kind === "mapStyle3d"),
    [routeAddons, addonOverrides]
  );
  const mapStyle3dActive = !!mapStyle3dEntry;
  const vectorBaseMap = mapStyle3dEntry?.config?.vectorBaseMap === true;
  const { pathname, search } = useLocation();

  // a layer's "conditionalLayer" tool keeps it off the map unless the route or
  // the hash query asks for it; the stack itself is left as it is
  const drawnLayers = useMemo(() => {
    const context = {
      route: conditionRouteOf(pathname),
      params: Object.fromEntries(new URLSearchParams(search)),
    };
    return geoportalLayers.filter((layer) =>
      isShownByCondition(layer, context)
    );
  }, [geoportalLayers, pathname, search]);

  const computedLibreLayers = useMemo(() => {
    // the mesh decisions look at what is drawn, so a layer its condition keeps
    // off the map neither holds the base map nor takes it away
    const userLayers = drawnLayers.filter(
      (layer) => layer.visible && !isAppOwnedLayer(layer)
    );
    const standaloneMeshOnly =
      userLayers.length > 0 && userLayers.every(layerIsStandaloneMesh);
    return [
      ...geoportalBackgroundToLibreLayers(backgroundLayer, namedLayers, {
        shadowTerrainActive: shadowState?.enabled === true,
        mapStyle3dActive,
        vectorBaseOverride:
          mapStyle3dActive &&
          (vectorBaseMap ||
            (shadowState?.enabled === true &&
              shadowState?.overrideBaseMapWithVectorStyle === true)),
        standaloneMeshOnly,
      }),
      ...geoportalLayersToLibreLayers(drawnLayers),
    ];
  }, [
    backgroundLayer,
    namedLayers,
    drawnLayers,
    mapStyle3dActive,
    vectorBaseMap,
    shadowState?.enabled,
    shadowState?.overrideBaseMapWithVectorStyle,
  ]);

  const libreLayersRef = useRef(computedLibreLayers);
  return useMemo(() => {
    if (
      JSON.stringify(libreLayersRef.current) ===
      JSON.stringify(computedLibreLayers)
    ) {
      return libreLayersRef.current;
    }
    libreLayersRef.current = computedLibreLayers;
    return computedLibreLayers;
  }, [computedLibreLayers]);
};

export default useLibreLayers;
