/**
 * Reference React Implementation of Leaflet-Cesium map transition
 */

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useState, useEffect, useRef } from "react";

import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import { CesiumTerrainProvider, type Scene } from "@carma/cesium";

import {
  transitionToCesium,
  transitionToLeaflet,
  TransitionDirection,
  TransitionStage,
  type TransitionOptions,
} from "@carma-mapping/engines-interop";
import { validateRequirements } from "./utils/validate-requirements";

type UseLeafletCesiumTransitionOptions = {
  preferedTerrainProvider?: "TERRAIN" | "SURFACE";
  initialIsMode2d?: boolean;
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
  activeFramework: "leaflet" | "cesium";
  isTransitioning: boolean;
  toggle: () => Promise<void>;
  requestTransitionToCesium: () => Promise<void>;
  requestTransitionToLeaflet: () => Promise<void>;
} => {
  // Initialize based on isMode2d ONLY on first mount - use useState lazy initializer
  const [activeFramework, setActiveFramework] = useState<"leaflet" | "cesium">(
    () => {
      const initialFramework =
        options.initialIsMode2d !== false ? "leaflet" : "cesium";
      console.log("[FRAMEWORK-SWITCHER] Hook FIRST MOUNT initialization:", {
        initialIsMode2d: options.initialIsMode2d,
        initialFramework,
      });
      return initialFramework;
    }
  );

  const [isTransitioning, setIsTransitioning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [targetHeadingPitch, setTargetHeadingPitch] = useState<any | null>(
    null
  );

  // Track if we've set initial CSS to avoid re-running on every render
  const hasSetInitialCssRef = useRef(false);

  // Initialize Cesium container visibility - watch for container to become available
  useEffect(() => {
    const cesiumContainer = getCesiumContainer();
    console.log("[FRAMEWORK-SWITCHER] Container CSS effect:", {
      activeFramework,
      hasContainer: !!cesiumContainer,
      hasSetInitialCss: hasSetInitialCssRef.current,
    });

    if (cesiumContainer && !hasSetInitialCssRef.current) {
      // Set initial state based on active framework
      if (activeFramework === "leaflet") {
        cesiumContainer.style.opacity = "0";
        cesiumContainer.style.pointerEvents = "none";
        console.log(
          "[FRAMEWORK-SWITCHER] Container CSS set to HIDDEN (Leaflet mode)"
        );
      } else {
        cesiumContainer.style.opacity = "1";
        cesiumContainer.style.pointerEvents = "auto";
        console.log(
          "[FRAMEWORK-SWITCHER] Container CSS set to VISIBLE (Cesium mode)"
        );
      }
      hasSetInitialCssRef.current = true;
    } else if (!cesiumContainer) {
      console.warn(
        "[FRAMEWORK-SWITCHER] Container not yet available, will retry on next render"
      );
    }
  }); // No dependencies - run on every render until container is available and CSS is set

  const requestTransitionToCesium = async () => {
    if (isTransitioning) return;

    const leaflet = getLeafletMap();
    const scene = getCesiumScene();
    const cesiumContainer = getCesiumContainer();
    const resolutionScale = getResolutionScale();
    const terrainProviders = getCesiumTerrainProviders();

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

      await transitionToCesium(
        scene,
        leaflet,
        cesiumContainer,
        resolutionScale || 1.0,
        terrainProviders,
        targetHeadingPitch,
        (stage: TransitionStage, message: string) => {
          console.debug(`[CESIUM] Transition stage: ${stage} - ${message}`);
        },
        () => {
          setActiveFramework("cesium");
          setIsTransitioning(false); // Clear transitioning state on completion
          options.onActiveFrameworkChange(TransitionDirection.TO_CESIUM);
          options.onTransitionComplete?.(TransitionDirection.TO_CESIUM);
        },
        (error: Error) => {
          console.error("[CESIUM] Transition error:", error);
          setIsTransitioning(false);
          options.onTransitionFailed?.(TransitionDirection.TO_CESIUM);
        },
        options.options?.toCesium
      );
    } catch (error) {
      console.error("[CESIUM] Transition to 3D failed:", error);
      setIsTransitioning(false);
      setActiveFramework("leaflet");
      options.onTransitionFailed?.(TransitionDirection.TO_CESIUM);
    }
  };

  const requestTransitionToLeaflet = async () => {
    if (isTransitioning) return;

    const scene = getCesiumScene();
    const leaflet = getLeafletMap();
    const cesiumContainer = getCesiumContainer();
    const resolutionScale = getResolutionScale();
    const terrainProviders = getCesiumTerrainProviders();

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
      options.onTransitionStart?.(TransitionDirection.TO_LEAFLET);

      const result = await transitionToLeaflet(
        scene,
        leaflet,
        cesiumContainer,
        resolutionScale || 1.0,
        terrainProviders,
        (stage: TransitionStage, message: string) => {
          console.debug(`[CESIUM] Transition stage: ${stage} - ${message}`);
        },
        () => {
          setActiveFramework("leaflet");
          setIsTransitioning(false); // Clear transitioning state on completion
          options.onActiveFrameworkChange(TransitionDirection.TO_LEAFLET);
          options.onTransitionComplete?.(TransitionDirection.TO_LEAFLET);
        },
        (error: Error) => {
          console.error("[CESIUM] Transition error:", error);
          setIsTransitioning(false); // Clear transitioning state on error
          options.onTransitionFailed?.(TransitionDirection.TO_LEAFLET);
        },
        options.options?.toLeaflet
      );

      setTargetHeadingPitch(result.targetHeadingPitch);
    } catch (error) {
      console.error("[CESIUM] Transition to Leaflet failed:", error);
      setIsTransitioning(false);
      setActiveFramework("cesium");
      options.onTransitionFailed?.(TransitionDirection.TO_LEAFLET);
    }
  };

  const toggle = async () => {
    if (activeFramework === "leaflet") {
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
    requestTransitionToLeaflet,
  };
};
