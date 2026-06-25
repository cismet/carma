import { useCallback, useContext, useEffect, useRef } from "react";

import {
  Cartographic,
  PolylineCollection,
  Primitive,
} from "@carma-cesium";

import { EnviroMetricMapContext } from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getTerrainElevationAsync } from "@carma-mapping/engines/cesium/core";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import { FLOODINGMAP_TERRAIN_PROVIDER_IDS } from "../../config/cesium/cesium.config";
import { getWebMercatorInWGS84 } from "../../utils/geo";
import { updateMarkerPosition } from "../../utils/marker";

export type FeatureInfoMarkerRefs = {
  markerPrimitiveRef: React.MutableRefObject<Primitive | null>;
  highlightPrimitiveRef: React.MutableRefObject<PolylineCollection | null>;
};

/** Single owner of the 3D feature-info marker: places it (retrying until terrain can be sampled) and removes it on mode-off and unmount. */
export const useFeatureInfoMarker3D = (): FeatureInfoMarkerRefs => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { isLeaflet } = useMapFrameworkSwitcherContext();
  const { isRuntimeReady, runtimeRef, getTerrainProviderById } =
    useCesiumContext();

  const markerPrimitiveRef = useRef<Primitive | null>(null);
  const highlightPrimitiveRef = useRef<PolylineCollection | null>(null);
  const markerRestoreTimeoutRef = useRef<number | null>(null);

  const removeMarker = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.isDestroyed()) {
      markerPrimitiveRef.current = null;
      highlightPrimitiveRef.current = null;
      return;
    }
    if (markerPrimitiveRef.current) {
      runtime.scene.primitives.remove(markerPrimitiveRef.current);
      markerPrimitiveRef.current = null;
    }
    if (highlightPrimitiveRef.current) {
      runtime.scene.primitives.remove(highlightPrimitiveRef.current);
      highlightPrimitiveRef.current = null;
    }
    runtime.scene.requestRender();
  }, [runtimeRef]);

  // Retry until the ground terrain provider is ready to sample — on a cold load runtime/terrain may still be loading when the position is already known.
  useEffect(() => {
    const position = controlState.currentFeatureInfoPosition;
    if (!controlState.featureInfoModeActivated || !position) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 40; // ~10s at 250ms — covers cold terrain loads
    const RETRY_DELAY_MS = 250;

    const clearPendingRetry = () => {
      if (markerRestoreTimeoutRef.current !== null) {
        clearTimeout(markerRestoreTimeoutRef.current);
        markerRestoreTimeoutRef.current = null;
      }
    };

    const scheduleRetry = () => {
      if (cancelled || attempt >= MAX_ATTEMPTS) return;
      attempt += 1;
      markerRestoreTimeoutRef.current = window.setTimeout(
        placeMarker,
        RETRY_DELAY_MS
      );
    };

    const placeMarker = async () => {
      if (cancelled) return;

      const runtime = runtimeRef.current;
      const terrainProvider =
        isRuntimeReady && runtime && !runtime.isDestroyed()
          ? getTerrainProviderById(FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020)
          : null;

      if (!runtime || !terrainProvider) {
        scheduleRetry();
        return;
      }

      const { lat, lon } = getWebMercatorInWGS84(position);
      const cartographic = Cartographic.fromDegrees(lon, lat);

      const [groundPositionCartographic] = await getTerrainElevationAsync(
        terrainProvider,
        [cartographic]
      );
      if (cancelled || runtime.isDestroyed()) return;

      // Terrain tiles not loaded yet (sampling returned nothing) — retry.
      if (!groundPositionCartographic) {
        scheduleRetry();
        return;
      }

      updateMarkerPosition(
        runtime,
        markerPrimitiveRef,
        highlightPrimitiveRef,
        groundPositionCartographic
      );
    };

    placeMarker();

    return () => {
      cancelled = true;
      clearPendingRetry();
    };
  }, [
    isRuntimeReady,
    getTerrainProviderById,
    runtimeRef,
    controlState.featureInfoModeActivated,
    controlState.currentFeatureInfoPosition,
    isLeaflet,
  ]);

  // Remove the marker when feature-info mode is turned off.
  useEffect(() => {
    if (!controlState.featureInfoModeActivated) {
      removeMarker();
    }
  }, [controlState.featureInfoModeActivated, removeMarker]);

  // Remove the marker on unmount.
  useEffect(() => () => removeMarker(), [removeMarker]);

  return { markerPrimitiveRef, highlightPrimitiveRef };
};
