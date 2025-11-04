/**
 * Reference React Implementation of Leaflet-Cesium map transition
 */

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useState } from "react";

import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import { CesiumTerrainProvider, isValidScene, type Scene } from "@carma/cesium";

import {
  type TransitionDirection,
  type TransitionOptions,
} from "@carma-mapping/engines-interop";
import { validateRequirements } from "./utils/validate-requirements";

type UseLeafletCesiumTransitionOptions = {
  preferedTerrainProvider?: "TERRAIN" | "SURFACE";
  onTransitionStart?: (transitionDirection: TransitionDirection) => void;
  onTransitionComplete?: (transitionDirection: TransitionDirection) => void;
  onTransitionFailed?: (transitionDirection: TransitionDirection) => void;
  onActiveFrameworkChange: (transitionDirection: TransitionDirection) => void;
  options?: TransitionOptions;
};

/**
 * React hook for managing 2D ↔ 3D map transitions (framework-agnostic)
 * Coordinates between Leaflet and Cesium, managing camera state and container visibility
 *
 * This hook does not depend on Redux or TopicMap - all dependencies are injected via props.
 */
export const useMapFrameworkSwitcher = (
  getLeafletMap: () => LeafletMap | null | undefined,
  getCesiumScene: () => Scene | null | undefined,
  getCesiumContainer: () => HTMLElement | null | undefined,
  getCesiumTerrainProviders: () => {
    "TERRAIN": CesiumTerrainProvider;
    "SURFACE": CesiumTerrainProvider;
  },
  getResolutionScale: () => number | undefined,
  options: UseLeafletCesiumTransitionOptions
): {
  requestTransitionToCesium: () => Promise<void>;
  requestTransitionToLeaflet: () => Promise<void>;
} => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prevHPR, setPrevHPR] = useState<any | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

  const setCesiumContainerVisible = createContainerVisibilityController(
    getCesiumContainer,
    step6_cameraAnimationDurationMs
  );

  const requestTransitionToCesium = async () => {
    const leaflet = getLeafletMap();
    const scene = getCesiumScene();
    const cesiumContainer = getCesiumContainer();
    const resolutionScale = getResolutionScale();

    const hasValidRequirements = validateRequirements(
      scene,
      cesiumContainer,
      resolutionScale,
      leaflet
    );

    if (!hasValidRequirements) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO3D] leaflet or cesium not available no transition possible [zoom]"
      );
      return;
    }

   

    onTransitionStart?.(false);

    await transitionToCesium(scene, leaflet, prevHPR, prevDuration, {
      duration: step6_cameraAnimationDurationMs,
      maxZoom: step1_prepare2dViewMaxZoom,
      zoomOutDuration: step1_zoomOutDurationMs,
      zoomOutEaseLinearity: step1_zoomOutEaseLinearity,
      zoomOutTimeoutBuffer:
        step2_initialRenderTimeoutMs + step3_resourceWaitTimeoutMs,
      setCesiumContainerVisible,
      onTransitionStart: () => {},
      onTransitionComplete: () => {
        onTransitionComplete?.(false);
        onComplete?.(false);
      },
      updateMode2dState: (is2d) => updateMode2dState?.(is2d),
    });
  };

  const requestTransitionToLeaflet = async () => {
    const scene = getCesiumScene();
    const leaflet = getLeafletMap();

    if (!leaflet) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO2D] leaflet not available no transition possible [zoom]"
      );
      return;
    }
    if (!isValidScene(scene)) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO2D] cesium not available no transition possible [zoom]"
      );
      return;
    }

    onTransitionStart?.(true);

    await transitionToLeaflet(scene, leaflet, setCesiumContainerVisible, {
      setPrevHPR,
      setPrevDuration,
      onTransitionStart,
      onTransitionComplete,
      onTransitionCancel,
    });
  };

  return { requestTransitionToCesium, requestTransitionToLeaflet };
};
