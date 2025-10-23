import { useState, useMemo, useCallback } from "react";
import type { Map as LeafletMap } from "leaflet";

import type { HeadingPitchRange } from "@carma/cesium";
import { metersPerPixelAtLatitudeRad } from "@carma/geo/utils";
import { degToRad } from "@carma/geo/helpers";
import type { Radians, Degrees } from "@carma/geo/types";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";

// Import from cesium engine
import {
  useCesiumContext,
  CtxEvent,
  useEnsureCesiumInitialized,
  type InitialCesiumPosition,
} from "@carma-mapping/engines/cesium/core";

// Import transition context
import { useTransitionContext } from "./use-transition-context";
import { MapTransitionState } from "./TransitionContext";

// Import transition implementations
import { createTransitionTo3d } from "./transition-to-3d";
import { createTransitionTo2d } from "./transition-to-2d";

export const isTransitionState = (state: unknown): boolean => {
  return [
    MapTransitionState.preTransitionTo2d,
    MapTransitionState.transitionTo2d,
    MapTransitionState.postTransitionTo2d,
    MapTransitionState.preTransitionTo3d,
    MapTransitionState.transitionTo3d,
    MapTransitionState.postTransitionTo3d,
  ].includes(state as MapTransitionState);
};

export const shouldBlockUserInput = (state: unknown): boolean => {
  // Post-transition states should NOT block user input
  if (
    state === MapTransitionState.postTransitionTo3d ||
    state === MapTransitionState.postTransitionTo2d
  ) {
    return false;
  }
  // All other transition states should block
  return isTransitionState(state);
};

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

/**
 * Converts Leaflet map position to Cesium initial position with HeadingPitchRange.
 * Uses dynamic import to avoid loading Cesium in 2D mode.
 */
const getLeafletPosition = async (
  leafletMap: LeafletMap | null
): Promise<InitialCesiumPosition | null> => {
  if (!leafletMap) return null;

  const { HeadingPitchRange, CesiumMath } = await import("@carma/cesium");

  const center = leafletMap.getCenter();
  const zoom = leafletMap.getZoom();
  const canvasHeightPx = leafletMap.getContainer().clientHeight || 800;

  const latRad = degToRad(center.lat as Degrees) as Radians;
  const metersPerPx = metersPerPixelAtLatitudeRad(zoom, latRad);
  const fovRad = CesiumMath.toRadians(60); // Standard Cesium FOV
  const distance = (canvasHeightPx * metersPerPx) / (2 * Math.tan(fovRad / 2));

  return {
    latitude: center.lat,
    longitude: center.lng,
    orientation: new HeadingPitchRange(
      0, // heading: north
      -Math.PI / 2, // pitch: straight down (top-down view)
      distance // range: calculated from zoom
    ),
  };
};

export const useMapTransition = (options: TransitionOptions = {}) => {
  const { config: contextConfig } = useTransitionContext();

  const { onComplete, onCancel } = options;

  const { leafletMapRef } = useCarmaTopicMapContext();
  const { transitionStateRef, transitionStageTrackerRef } =
    useTransitionContext();
  const {
    widgetRef,
    sceneRef,
    emit: emitCesiumEvent,
    subscribe,
  } = useCesiumContext();
  const { ensureInitialized } = useEnsureCesiumInitialized();

  const [last3dCameraOrientation, setLast3dCameraOrientation] =
    useState<HeadingPitchRange | null>(null);
  const [last3dAnimationDuration, setLast3dAnimationDuration] =
    useState<number>(0);

  const transition3dParams = useMemo(
    () => ({
      leafletMapRef,
      sceneRef,
      widgetRef,
      transitionStateRef,
      transitionStageTrackerRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      config: contextConfig.modeTo3d,
      emitCesiumEvent,
      subscribe,
      onComplete,
      onCancel,
    }),
    [
      leafletMapRef,
      sceneRef,
      widgetRef,
      transitionStateRef,
      transitionStageTrackerRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      contextConfig.modeTo3d,
      emitCesiumEvent,
      subscribe,
      onComplete,
      onCancel,
    ]
  );

  const transition2dParams = useMemo(
    () => ({
      leafletMapRef,
      sceneRef,
      transitionStateRef,
      transitionStageTrackerRef,
      setLast3dCameraOrientation,
      setLast3dAnimationDuration,
      config: contextConfig.modeTo2d,
      onComplete,
      onCancel,
    }),
    [
      leafletMapRef,
      sceneRef,
      transitionStateRef,
      transitionStageTrackerRef,
      contextConfig.modeTo2d,
      onComplete,
      onCancel,
    ]
  );

  // Create transition factories (memoized via params)
  const transitionTo3dFactory = createTransitionTo3d(transition3dParams);
  const transitionTo2dFactory = createTransitionTo2d(transition2dParams);

  const transitionToMode3d = useCallback(async () => {
    // Guard: Ensure Cesium is initialized at current 2D position
    const leafletMap = leafletMapRef.current;
    const initialPosition = await getLeafletPosition(leafletMap);

    if (initialPosition) {
      // Wait for terrain to be loaded before starting transition
      // This ensures terrain elevation sampling will work reliably
      await ensureInitialized(initialPosition, { waitForTerrain: true });
    }

    // Now transition (scene guaranteed ready with terrain loaded)
    return transitionTo3dFactory(CtxEvent);
  }, [leafletMapRef, ensureInitialized, transitionTo3dFactory]);

  const transitionToMode2d = useCallback(() => {
    return transitionTo2dFactory();
  }, [transitionTo2dFactory]);
  return { transitionToMode2d, transitionToMode3d };
};

export default useMapTransition;
