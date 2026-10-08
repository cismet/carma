import { useEffect, useMemo, useRef, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
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
  useObliqueViewerActions,
} from "@carma-mapping/addons";
import type { LibreLayer } from "@carma-mapping/core";
import { useLibreContext } from "@carma-mapping/contexts";
import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  acquireMapLibreTerrainMeshComposition,
  acquireMapLibreTerrainDemandPause,
  acquireMapLibreTerrainZoomLimit,
  WUPPERTAL_TERRAIN_SOURCE_ID,
  registerSharedThreeSceneRuntime,
  notifySharedThreeSceneContentChanged,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
  hasSharedThreeShadedPresentation,
  subscribeSharedThreeShadedPresentation,
} from "@carma-mapping/engines/maplibre";
import { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";

import { geoportalBackgroundToLibreLayers } from "../../components/GeoportalMap/geoportalBackgroundToLibreLayers";
import {
  geoportalLayersToLibreLayers,
  isAppOwnedLayer,
  layerIsStandaloneMesh,
} from "../../components/GeoportalMap/geoportalLayersToLibreLayers";
import { backgroundConfig } from "../../config/backgroundConfig";
import {
  OBLIQUE_BASE_TILESET_URLS,
  OBLIQUE_LOD2_STYLE,
  OBLIQUE_MESH_2024_STYLE_URI,
} from "../../config/oblique.config";
import { MapStyleKeys } from "../../constants/MapStyleKeys";
import { useMapStyle } from "../useGeoportalMapStyle";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

const readStyleObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { namedLayers } = backgroundConfig;
  const [shadowState] = useAddonState("shadowSimulation");
  const routeAddons = useRouteAddons();
  const [addonOverrides] = usePersistedAddonOverrides();
  const effectiveAddons = useMemo(
    () => applyAddonOverrides(resolveAddonEntries(routeAddons), addonOverrides),
    [routeAddons, addonOverrides]
  );
  const { isOn: obliqueOn, previewVisible } = useObliqueViewerActions();
  const obliqueActive =
    obliqueOn === true &&
    effectiveAddons.some((entry) => entry.kind === "obliqueViewer");
  const mapStyle3dEntry = effectiveAddons.find(
    (entry) => entry.kind === "mapStyle3d"
  );
  const mapStyle3dActive = !!mapStyle3dEntry;
  const vectorBaseMap = mapStyle3dEntry?.config?.vectorBaseMap === true;
  const [obliqueMeshStyle, setObliqueMeshStyle] =
    useState<StyleSpecification | null>(null);
  useEffect(() => {
    if (!obliqueActive || obliqueMeshStyle) return;
    const controller = new AbortController();
    void fetch(OBLIQUE_MESH_2024_STYLE_URI, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Mesh style HTTP " + response.status);
        const style = (await response.json()) as StyleSpecification;
        if (controller.signal.aborted) return;
        const metadata = readStyleObject(style.metadata);
        const carmaConf = readStyleObject(metadata.carmaConf);
        const tiles3d = readStyleObject(carmaConf["3d"]);
        if (
          typeof tiles3d.tilesetUrl !== "string" ||
          tiles3d.tilesetUrl.trim().length === 0
        )
          throw new Error("Mesh style has no 3D tileset");
        setObliqueMeshStyle({
          ...style,
          metadata: {
            ...metadata,
            carmaConf: {
              ...carmaConf,
              "3d": { ...tiles3d, basemap: "labels" },
            },
          },
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          console.warn("[oblique] mesh style could not load", error);
      });
    return () => controller.abort();
  }, [obliqueActive, obliqueMeshStyle]);
  const { currentStyle, setCurrentStyle } = useMapStyle();
  const { map } = useLibreContext();
  const wasObliqueActive = useRef(false);
  useEffect(() => {
    if (obliqueActive && !wasObliqueActive.current)
      setCurrentStyle(MapStyleKeys.AERIAL);
    wasObliqueActive.current = obliqueActive;
  }, [obliqueActive, setCurrentStyle]);

  // Three.js labels are opt-in independently of the viewer's mesh/terrain basis.
  useEffect(() => {
    if (!map || !obliqueActive || !mapStyle3dActive) return;
    const lease = acquireSharedThreeScene(map, { mapStylePresentation: true });
    lease.setPointLabelOverlayVisible(true);
    return () => lease.release();
  }, [map, obliqueActive, mapStyle3dActive]);

  const obliqueTerrainRef = useRef<ReturnType<
    typeof buildRasterDemTerrainRuntime
  > | null>(null);
  const restoreNativePaintRef = useRef<(() => void) | null>(null);
  // Karte draws the DEM; Mesh keeps it only as a cached CPU height sampler.
  // Style changes preserve its worker, decoded tiles and geometry.
  useEffect(() => {
    if (!map || !obliqueActive) return;
    const lease = acquireSharedThreeScene(map);
    const origin = map.getCenter();
    const runtime = buildRasterDemTerrainRuntime(
      "carma-oblique-terrain",
      NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
      [origin.lng, origin.lat],
      {
        geometryProjection: "ecef",
        receivesMapStyleTexture: true,
        material: { unlit: true },
        groundVisible: false,
        errorTargetPixels: 1,
        motionErrorTargetPixels: 4,
        maximumMeshSegments: 128,
        onContentChanged: (bounds) =>
          notifySharedThreeSceneContentChanged(map, { bounds }),
      }
    );
    runtime.setTileDemandPaused(true);
    obliqueTerrainRef.current = runtime;
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    return () => {
      if (obliqueTerrainRef.current === runtime)
        obliqueTerrainRef.current = null;
      unregister();
      lease.layer.removeRuntime(runtime.id);
      lease.release();
    };
  }, [map, obliqueActive]);
  useEffect(() => {
    if (!map || !obliqueActive) return;
    let active = true;
    const syncBasis = () => {
      if (!active) return;
      const aerial = currentStyle === MapStyleKeys.AERIAL;
      const meshAttached = getSharedThreeSceneRuntimes(map).some(
        (runtime) =>
          runtime.id !== "carma-oblique-terrain" &&
          runtime.providesTerrain === true &&
          runtime.mapStyleProjectionBlend !== "replace"
      );
      // Layer reconciliation may lag behind the toggle. Do not expose either
      // DEM renderer until the outgoing mesh has actually left the scene.
      const showTerrain = !aerial && !meshAttached;
      obliqueTerrainRef.current?.setGroundVisible(showTerrain);
      obliqueTerrainRef.current?.setTileDemandPaused(!showTerrain);
      const hideNativeGround = aerial
        ? hasSharedThreeShadedPresentation(map)
        : meshAttached;
      if (hideNativeGround && !restoreNativePaintRef.current)
        restoreNativePaintRef.current =
          acquireMapLibreTerrainMeshComposition(map);
      else if (!hideNativeGround && restoreNativePaintRef.current) {
        restoreNativePaintRef.current();
        restoreNativePaintRef.current = null;
      }
    };
    const unsubscribeContent = subscribeSharedThreeSceneContent(map, syncBasis);
    const unsubscribePresentation = subscribeSharedThreeShadedPresentation(
      map,
      syncBasis
    );
    syncBasis();
    return () => {
      active = false;
      unsubscribeContent();
      unsubscribePresentation();
    };
  }, [map, obliqueActive, currentStyle]);
  useEffect(
    () => () => {
      restoreNativePaintRef.current?.();
      restoreNativePaintRef.current = null;
    },
    [map, obliqueActive]
  );
  useEffect(() => {
    if (
      !map ||
      !obliqueActive ||
      currentStyle !== MapStyleKeys.AERIAL ||
      !mapStyle3dActive
    )
      return;
    // Label placement needs coarse ground height, never image-resolution DEMs.
    return acquireMapLibreTerrainZoomLimit(
      map,
      WUPPERTAL_TERRAIN_SOURCE_ID,
      13
    );
  }, [map, obliqueActive, currentStyle, mapStyle3dActive]);
  useEffect(() => {
    if (!map || !obliqueActive) return;
    const pauseMeshTerrain =
      currentStyle === MapStyleKeys.AERIAL &&
      (!mapStyle3dActive || previewVisible === true);
    if (!pauseMeshTerrain) return;
    // Retain native terrain/RTT and camera elevation; freeze only tile demand.
    return acquireMapLibreTerrainDemandPause(map, WUPPERTAL_TERRAIN_SOURCE_ID);
  }, [map, obliqueActive, currentStyle, mapStyle3dActive, previewVisible]);
  // Raster capture is needed on Karte even when the optional 3D-label addon is off.
  useEffect(() => {
    if (!map || !obliqueActive || currentStyle === MapStyleKeys.AERIAL) return;
    const lease = acquireSharedThreeScene(map, { mapStylePresentation: true });
    lease.setMeshLabelStyle(false);
    return () => lease.release();
  }, [map, obliqueActive, currentStyle]);
  const { pathname, search } = useLocation();

  // a layer's "conditionalLayer" tool keeps it off the map unless the route or
  // the hash query asks for it; the stack itself is left as it is
  const drawnLayers = useMemo(() => {
    const context = {
      route: conditionRouteOf(pathname),
      params: Object.fromEntries(new URLSearchParams(search)),
    };
    return geoportalLayers.filter((layer) => {
      if (!isShownByCondition(layer, context)) return false;
      if (!obliqueActive) return true;
      // The selected basis is drawn once, even if the same tileset was added explicitly.
      const conf = layer.conf as { "3d"?: { tilesetUrl?: string } } | undefined;
      const style = (
        layer.props as
          | { style?: { metadata?: { carmaConf?: typeof conf } } }
          | undefined
      )?.style;
      const url =
        conf?.["3d"]?.tilesetUrl ??
        style?.metadata?.carmaConf?.["3d"]?.tilesetUrl;
      return !url || !OBLIQUE_BASE_TILESET_URLS.includes(url);
    });
  }, [geoportalLayers, pathname, search, obliqueActive]);

  const computedLibreLayers = useMemo(() => {
    // the mesh decisions look at what is drawn, so a layer its condition keeps
    // off the map neither holds the base map nor takes it away
    const userLayers = drawnLayers.filter(
      (layer) => layer.visible && !isAppOwnedLayer(layer)
    );
    const standaloneMeshOnly =
      !obliqueActive &&
      userLayers.length > 0 &&
      userLayers.every(layerIsStandaloneMesh);
    const obliqueMeshActive =
      obliqueActive &&
      currentStyle === MapStyleKeys.AERIAL &&
      !!obliqueMeshStyle;
    const obliqueBasis: LibreLayer[] =
      obliqueActive &&
      (currentStyle !== MapStyleKeys.AERIAL || obliqueMeshStyle)
        ? [
            {
              type: "vector",
              name:
                currentStyle === MapStyleKeys.AERIAL
                  ? "oblique-mesh2024"
                  : "oblique-lod2",
              carmaLayerId: "__oblique-basemap",
              style:
                currentStyle === MapStyleKeys.AERIAL
                  ? obliqueMeshStyle!
                  : OBLIQUE_LOD2_STYLE,
              opacity: 1,
            },
          ]
        : [];
    return [
      ...geoportalBackgroundToLibreLayers(backgroundLayer, namedLayers, {
        shadowTerrainActive:
          shadowState?.enabled === true ||
          (obliqueActive && currentStyle !== MapStyleKeys.AERIAL),
        mapStyle3dActive,
        meshBaseActive: obliqueMeshActive,
        vectorBaseOverride:
          mapStyle3dActive &&
          (vectorBaseMap ||
            (shadowState?.enabled === true &&
              shadowState?.overrideBaseMapWithVectorStyle === true)),
        standaloneMeshOnly,
      }),
      ...obliqueBasis,
      ...geoportalLayersToLibreLayers(drawnLayers),
    ];
  }, [
    backgroundLayer,
    namedLayers,
    drawnLayers,
    mapStyle3dActive,
    vectorBaseMap,
    obliqueActive,
    obliqueMeshStyle,
    currentStyle,
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
