import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { clamp } from "@carma-commons/math";
import {
  getSharedThreeSceneRuntimes,
  MAPLIBRE_EVENT,
} from "@carma-mapping/engines/maplibre";

import type {
  ShadowDateState,
  ShadowSimulationState,
  ShadowTerrainOptions,
} from "../contracts/shadow-simulation";
import {
  getSolarPosition,
  type SolarLocation,
} from "../core/solar-position";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_BUILDING_COLOR,
  DEFAULT_SHADOW_BUILDING_COLOR_MIX,
  DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
  DEFAULT_SHADOW_SURFACE_COLOR,
  resolveShadowQuality,
} from "../core/shadow-types";
import {
  buildShadowSimulationScene,
  type ShadowSimulationScene,
} from "./shadow-scene";

export const ShadowSimulationRuntime = ({
  libreMap,
  shadowAreaMeters,
  terrain,
  location,
  state,
  dateState,
}: {
  libreMap: MaplibreMap | null;
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  location: SolarLocation;
  state: ShadowSimulationState;
  dateState: ShadowDateState;
}) => {
  const shadowScene = useRef<ShadowSimulationScene | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const solarPosition = useMemo(
    () => getSolarPosition(dateState, location),
    [dateState, location]
  );

  useEffect(() => {
    if (!libreMap || !state.enabled) return;
    // URL state can enable the simulation before the style is ready.
    let scene: ShadowSimulationScene | null = null;
    const tryBuild = () => {
      if (scene || !libreMap.isStyleLoaded()) return;
      libreMap.off(MAPLIBRE_EVENT.STYLE_DATA, tryBuild);
      libreMap.off(MAPLIBRE_EVENT.STYLE_LOAD, tryBuild);
      scene = buildShadowSimulationScene(libreMap, {
        shadowAreaMeters,
        terrain,
      });
      shadowScene.current = scene;
      setSceneRevision((revision) => revision + 1);
    };
    tryBuild();
    if (!scene) {
      libreMap.on(MAPLIBRE_EVENT.STYLE_DATA, tryBuild);
      libreMap.on(MAPLIBRE_EVENT.STYLE_LOAD, tryBuild);
    }
    return () => {
      libreMap.off(MAPLIBRE_EVENT.STYLE_DATA, tryBuild);
      libreMap.off(MAPLIBRE_EVENT.STYLE_LOAD, tryBuild);
      shadowScene.current = null;
      scene?.dispose();
      scene = null;
    };
  }, [libreMap, shadowAreaMeters, state.enabled, terrain]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSolarPosition(solarPosition);
  }, [solarPosition, state.enabled, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowQuality(
      resolveShadowQuality(state.shadowQuality)
    );
  }, [state.enabled, state.shadowQuality, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateMeshErrorTarget(
      state.meshErrorTarget ?? DEFAULT_MESH_ERROR_TARGET_PIXELS
    );
  }, [state.enabled, state.meshErrorTarget, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSoftSunShadows(state.softSunShadows ?? true);
  }, [state.enabled, state.softSunShadows, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTimeAnimating(state.isAnimating ?? false);
  }, [state.enabled, state.isAnimating, sceneRevision]);

  useEffect(() => {
    if (!state.enabled || !state.showProjectionDebugView) return;
    shadowScene.current?.refreshProjectionDebug();
  }, [state.enabled, state.showProjectionDebugView, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowIntensity(state.shadowIntensity ?? 1);
  }, [state.enabled, state.shadowIntensity, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateMapStyleContentVisibility(
      state.showMapStyleContent ?? true
    );
  }, [state.enabled, state.showMapStyleContent, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateMapStyleLabelOverlayVisibility(
      (state.showMapStyleContent ?? true) && (state.showMapStyleLabels ?? true)
    );
  }, [
    state.enabled,
    state.showMapStyleContent,
    state.showMapStyleLabels,
    sceneRevision,
  ]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSunDebugVectorVisibility(
      state.showSunDebugVector ?? false
    );
  }, [state.enabled, state.showSunDebugVector, sceneRevision]);

  useEffect(() => {
    if (!libreMap) return;
    const visible =
      state.enabled &&
      (state.showProjectionDebugView ?? false) &&
      (state.showTileBounds ?? false);
    for (const runtime of getSharedThreeSceneRuntimes(libreMap)) {
      runtime.setTileBoundsVisible?.(visible);
    }
    return () => {
      for (const runtime of getSharedThreeSceneRuntimes(libreMap)) {
        runtime.setTileBoundsVisible?.(false);
      }
    };
  }, [
    libreMap,
    sceneRevision,
    state.enabled,
    state.showProjectionDebugView,
    state.showTileBounds,
  ]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateAtmosphericLutUsage({
      useTransmittanceLut: state.useTransmittanceLut ?? true,
      useIrradianceLut: state.useSkyIrradianceLut ?? true,
    });
  }, [
    state.enabled,
    state.useSkyIrradianceLut,
    state.useTransmittanceLut,
    sceneRevision,
  ]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTerrainColor(
      state.terrainColor ?? DEFAULT_SHADOW_SURFACE_COLOR
    );
  }, [state.enabled, state.terrainColor, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateBuildingAppearance({
      fullOpacity: state.buildingsFullOpacity ?? true,
      uniformColor: state.buildingColor ?? DEFAULT_SHADOW_BUILDING_COLOR,
      uniformColorMix: clamp(
        state.buildingColorMix ?? DEFAULT_SHADOW_BUILDING_COLOR_MIX,
        0,
        1
      ),
      textureSaturation: clamp(
        state.meshTextureSaturation ??
          DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
        0,
        1
      ),
    });
  }, [
    state.buildingColor,
    state.buildingColorMix,
    state.buildingsFullOpacity,
    state.enabled,
    state.meshTextureSaturation,
    sceneRevision,
  ]);

  return null;
};
