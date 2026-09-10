import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { clamp } from "@carma-commons/math";
import type { RasterDemTerrainResource } from "@carma-commons/resources";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
  MAPLIBRE_EVENT,
} from "@carma-mapping/engines/maplibre";

import type {
  ShadowDateState,
  ShadowDateStateSetter,
  ShadowSimulationState,
  ShadowTerrainOptions,
  ShadowTerrainQuality,
} from "../contracts/shadow-simulation";
import { getSolarPosition, type SolarLocation } from "../core/solar-position";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_BUILDING_COLOR,
  DEFAULT_SHADOW_BUILDING_COLOR_MIX,
  DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
  DEFAULT_SHADOW_SURFACE_COLOR,
  resolveShadowQuality,
  resolveShadowTerrainQuality,
} from "../core/shadow-types";
import {
  buildShadowSimulationScene,
  type ShadowSimulationScene,
} from "./shadow-scene";
import { useShadowAnimation } from "./hooks/use-shadow-animation";

export const ShadowSimulationRuntime = ({
  libreMap,
  shadowAreaMeters,
  terrain,
  mapLibreTerrain,
  terrainQuality,
  location,
  state,
  dateState,
  setDateState,
}: {
  libreMap: MaplibreMap | null;
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  mapLibreTerrain?: RasterDemTerrainResource;
  terrainQuality?: ShadowTerrainQuality;
  location: SolarLocation;
  state: ShadowSimulationState;
  dateState: ShadowDateState;
  setDateState: ShadowDateStateSetter;
}) => {
  const shadowScene = useRef<ShadowSimulationScene | null>(null);
  // Animation ticks bypass React: the sun is pushed into the scene here and the
  // shared date follows at a throttled rate for the label and the URL hash.
  const animatedDate = useShadowAnimation({
    dateState,
    setDateState,
    location,
    shadowState: state,
    onFrame: (next) => {
      if (!state.enabled) return;
      shadowScene.current?.updateSolarPosition(getSolarPosition(next, location));
    },
  });
  const effectiveTerrain = useMemo(
    () =>
      resolveShadowTerrainQuality(
        terrain,
        resolveShadowQuality(state.shadowQuality),
        state.terrainErrorTarget
      ),
    [terrain, state.shadowQuality, state.terrainErrorTarget]
  );
  const terrainRef = useRef(effectiveTerrain);
  terrainRef.current = effectiveTerrain;
  const [sceneRevision, setSceneRevision] = useState(0);

  useEffect(() => {
    if (!libreMap || !state.enabled) return;
    // URL state can enable the simulation before the style is ready.
    let scene: ShadowSimulationScene | null = null;
    let frame: number | null = null;
    let task: ReturnType<typeof setTimeout> | null = null;
    const removeStyleReadinessListeners = () => {
      libreMap.off(MAPLIBRE_EVENT.STYLE_DATA, tryBuild);
      libreMap.off(MAPLIBRE_EVENT.STYLE_LOAD, tryBuild);
      libreMap.off(MAPLIBRE_EVENT.IDLE, tryBuild);
    };
    const tryBuild = () => {
      if (scene || frame !== null || task !== null || !libreMap.isStyleLoaded())
        return;
      // Let controls paint before allocating the shadow scene. The addon gates
      // the canvas until its first shaded pass; terrain fidelity is unchanged.
      frame = requestAnimationFrame(() => {
        frame = null;
        task = setTimeout(() => {
          task = null;
          if (!libreMap.isStyleLoaded()) return;
          removeStyleReadinessListeners();
          scene = buildShadowSimulationScene(libreMap, {
            shadowAreaMeters,
            terrain: terrainRef.current,
            mapLibreTerrain,
            terrainQuality,
          });
          shadowScene.current = scene;
          setSceneRevision((revision) => revision + 1);
        }, 0);
      });
    };
    // Subscribe before checking readiness. Otherwise the style can finish in
    // the gap between isStyleLoaded() and listener registration, leaving a
    // URL-enabled simulation permanently without its Three scene.
    libreMap.on(MAPLIBRE_EVENT.STYLE_DATA, tryBuild);
    libreMap.on(MAPLIBRE_EVENT.STYLE_LOAD, tryBuild);
    libreMap.on(MAPLIBRE_EVENT.IDLE, tryBuild);
    tryBuild();
    return () => {
      removeStyleReadinessListeners();
      if (frame !== null) cancelAnimationFrame(frame);
      if (task !== null) clearTimeout(task);
      shadowScene.current = null;
      scene?.dispose();
      scene = null;
    };
  }, [
    libreMap,
    shadowAreaMeters,
    state.enabled,
    mapLibreTerrain,
    terrainQuality,
  ]);

  useEffect(() => {
    shadowScene.current?.updateTerrain(effectiveTerrain);
  }, [effectiveTerrain, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    // A running animation already showed a newer date than the shared state.
    const shown = animatedDate.current ?? dateState;
    shadowScene.current?.updateSolarPosition(getSolarPosition(shown, location));
  }, [animatedDate, dateState, location, state.enabled, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowQuality(
      resolveShadowQuality(state.shadowQuality)
    );
  }, [state.enabled, state.shadowQuality, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateRenderQuality({
      shadowAdaptiveQuality: state.shadowAdaptiveQuality,
      shadowBufferLayout: state.shadowBufferLayout,
      shadowBufferFormat: state.shadowBufferFormat,
      shadowSunDiscSamples: state.shadowSunDiscSamples,
      shadowMsaaSamples: state.shadowMsaaSamples,
      shadowGroundTexelFit: state.shadowGroundTexelFit,
    });
  }, [
    state.enabled,
    state.shadowAdaptiveQuality,
    state.shadowBufferLayout,
    state.shadowBufferFormat,
    state.shadowSunDiscSamples,
    state.shadowMsaaSamples,
    state.shadowGroundTexelFit,
    sceneRevision,
  ]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateMeshErrorTarget(
      state.meshErrorTarget ?? DEFAULT_MESH_ERROR_TARGET_PIXELS
    );
  }, [state.enabled, state.meshErrorTarget, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateMeshCacheBudget(state.meshCacheBudgetBytes);
  }, [state.enabled, state.meshCacheBudgetBytes, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSoftSunShadows(state.softSunShadows ?? true);
  }, [state.enabled, state.softSunShadows, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTimeAnimating(state.isAnimating ?? false);
  }, [state.enabled, state.isAnimating, sceneRevision]);

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
    shadowScene.current?.updateMapStyleElevationVisibility(
      state.showMapStyleElevationLines ?? false,
      state.showMapStyleElevationLabels ?? false
    );
  }, [
    state.enabled,
    state.showMapStyleElevationLines,
    state.showMapStyleElevationLabels,
    sceneRevision,
  ]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSunDebugVectorVisibility(
      (state.showProjectionDebugView ?? false) &&
        (state.showSunDebugVector ?? true)
    );
  }, [
    state.enabled,
    state.showProjectionDebugView,
    state.showSunDebugVector,
    sceneRevision,
  ]);

  useEffect(() => {
    if (!libreMap) return;
    const visible =
      state.enabled &&
      (state.showProjectionDebugView ?? false) &&
      (state.showTileBounds ?? true);
    if (!visible) return;
    const applied = new Set<
      ReturnType<typeof getSharedThreeSceneRuntimes>[number]
    >();
    const syncTileBounds = () => {
      const runtimes = getSharedThreeSceneRuntimes(libreMap);
      for (const runtime of applied)
        if (!runtimes.includes(runtime)) applied.delete(runtime);
      for (const runtime of runtimes) {
        if (applied.has(runtime)) continue;
        runtime.setTileBoundsVisible?.(visible);
        applied.add(runtime);
      }
    };
    syncTileBounds();
    const unsubscribe = subscribeSharedThreeSceneContent(
      libreMap,
      syncTileBounds
    );
    return () => {
      unsubscribe();
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
      textureColorCorrection: state.meshTextureColorCorrection ?? true,
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
    state.meshTextureColorCorrection,
    sceneRevision,
  ]);

  return null;
};
