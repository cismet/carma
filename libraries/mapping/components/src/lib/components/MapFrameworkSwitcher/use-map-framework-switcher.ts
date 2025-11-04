/**
 * Reference React Implementation of Leaflet-Cesium map transition
 */

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useState } from "react";

import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import { CesiumTerrainProvider, isValidScene, type Scene } from "@carma/cesium";

import {
  transitionToLeaflet,
  TransitionDirection,
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
 * React hook for managing 2D/3D map transitions (framework-agnostic)
 * Coordinates between Leaflet and Cesium, managing camera state and container visibility
 * Linkup to cesium or redux is delegated to consuming app logic.
 */
export const useMapFrameworkSwitcher = (
  getLeafletMap: () => LeafletMap | null | undefined,
  getCesiumScene: () => Scene | null | undefined,
  getCesiumContainer: () => HTMLElement | null | undefined,
  getCesiumTerrainProviders: () => {
    TERRAIN: CesiumTerrainProvider;
    SURFACE: CesiumTerrainProvider;
  },
  getResolutionScale: () => number | undefined,
  options: UseLeafletCesiumTransitionOptions
): {
  activeFramework: 'leaflet' | 'cesium';
  isTransitioning: boolean;
  toggle: () => Promise<void>;
  requestTransitionToCesium: () => Promise<void>;
  requestTransitionToLeaflet: () => Promise<void>;
} => {
  const [activeFramework, setActiveFramework] = useState<'leaflet' | 'cesium'>('leaflet');
  const [isTransitioning, setIsTransitioning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [targetHPR, setTargetHPR] = useState<any | null>(null);
  const [targetDuration, setTargetDuration] = useState<number>(0);

  const requestTransitionToCesium = async () => {
    if (isTransitioning) return;

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

    try {
      setIsTransitioning(true);
      options.onTransitionStart?.(TransitionDirection.TO_CESIUM);
      
      //await transitionToCesium(scene, leaflet, ...
      
      setActiveFramework('cesium');
      options.onActiveFrameworkChange(TransitionDirection.TO_CESIUM);
      options.onTransitionComplete?.(TransitionDirection.TO_CESIUM);
    } catch (error) {
      console.error('[CESIUM] Transition to 3D failed:', error);
      options.onTransitionFailed?.(TransitionDirection.TO_CESIUM);
    } finally {
      setIsTransitioning(false);
    }
  };

  const requestTransitionToLeaflet = async () => {
    if (isTransitioning) return;

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

    try {
      setIsTransitioning(true);
      options.onTransitionStart?.(TransitionDirection.TO_LEAFLET);
      
      //await transitionToLeaflet
      
      setActiveFramework('leaflet');
      options.onActiveFrameworkChange(TransitionDirection.TO_LEAFLET);
      options.onTransitionComplete?.(TransitionDirection.TO_LEAFLET);
    } catch (error) {
      console.error('[CESIUM] Transition to 2D failed:', error);
      options.onTransitionFailed?.(TransitionDirection.TO_LEAFLET);
    } finally {
      setIsTransitioning(false);
    }
  };

  const toggle = async () => {
    if (activeFramework === 'leaflet') {
      await requestTransitionToCesium();
    } else {
      await requestTransitionToLeaflet();
    }
  };

  return { 
    activeFramework,
    isTransitioning,
    toggle,
    requestTransitionToCesium, 
    requestTransitionToLeaflet 
  };
};
