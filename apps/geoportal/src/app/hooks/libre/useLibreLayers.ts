import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  applyAddonOverrides,
  conditionRouteOf,
  isShownByCondition,
  resolveAddonEntries,
  useAddonState,
  useMeasurement3dRuntimeServices,
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
import {
  backgroundConfig,
  findBackgroundCategory,
} from "../../config/backgroundConfig";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";
import { getLibre3d, getLibre3dTransition } from "../../store/slices/ui";

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const libre3d = useSelector(getLibre3d);
  const libre3dTransition = useSelector(getLibre3dTransition);
  const { namedLayers } = backgroundConfig;
  const [shadowState] = useAddonState("shadowSimulation");
  const routeAddons = useRouteAddons();
  const [addonOverrides] = usePersistedAddonOverrides();
  const mapStyle3dActive = useMemo(
    () =>
      applyAddonOverrides(
        resolveAddonEntries(routeAddons),
        addonOverrides
      ).some(({ kind }) => kind === "mapStyle3d"),
    [routeAddons, addonOverrides]
  );
  const { pathname, search } = useLocation();
  // Saved 3D measurement sets leave the flat map only while the 3D
  // measurement runtime draws them (a mesh is drawn); without it their flat
  // style stays, as where the addon does not run.
  const measurement3dDrawsSavedSets =
    useMeasurement3dRuntimeServices() !== null;

  // a layer's "conditionalLayer" tool keeps it off the map unless the route or
  // the hash query asks for it; the stack itself is left as it is
  const drawnLayers = useMemo(() => {
    const context = {
      route: conditionRouteOf(pathname),
      params: Object.fromEntries(new URLSearchParams(search)),
    };
    return geoportalLayers.filter(
      (layer) => isShownByCondition(layer, context)
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
    // while entering or leaving, the 3D styles lie on the 2D background so
    // the map never goes blank and the camera stays free until it is flat
    const styles3d =
      (libre3d || libre3dTransition) && backgroundLayer
        ? findBackgroundCategory(backgroundLayer.id)?.libre3dStyles
        : undefined;
    const background2d =
      styles3d && !libre3dTransition
        ? []
        : geoportalBackgroundToLibreLayers(backgroundLayer, namedLayers, {
            shadowTerrainActive: shadowState?.enabled === true,
            mapStyle3dActive,
            vectorBaseOverride:
              mapStyle3dActive &&
              shadowState?.enabled === true &&
              shadowState?.overrideBaseMapWithVectorStyle === true,
            standaloneMeshOnly,
          });
    const background: LibreLayer[] = [
      ...background2d,
      ...(styles3d ?? []).map(
        (style, index): LibreLayer => ({
          type: "vector",
          name: `bg3d-${index}`,
          carmaLayerId: backgroundLayer.id,
          style,
        })
      ),
    ];
    return [
      ...background,
      ...geoportalLayersToLibreLayers(drawnLayers, {
        skip3dMeasurementSets: measurement3dDrawsSavedSets,
      }),
    ];
  }, [
    backgroundLayer,
    libre3d,
    libre3dTransition,
    namedLayers,
    drawnLayers,
    mapStyle3dActive,
    measurement3dDrawsSavedSets,
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
