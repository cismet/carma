import React, {
  createContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Scene, Cartesian3 } from "@carma/cesium";

import { useCesiumContext } from "@carma-mapping/engines/cesium/core";

import type {
  CesiumOverlayContextValue,
  VisualizationRegistration,
  ScreenPosition,
} from "../types";
import { cartesianToScreen } from "../utils/coordinateTransforms";

export const CesiumOverlayContext = createContext<
  CesiumOverlayContextValue | undefined
>(undefined);

interface CesiumOverlayProviderProps {
  children: ReactNode;
}

/**
 * Provider for generic DOM/Canvas/SVG overlay system
 * 
 * Salvaged from cesium-reference playground measurements.
 * Updates screen positions on every Cesium postRender event for real-time sync.
 * 
 * @example
 * ```tsx
 * <CesiumOverlayProvider>
 *   <YourCesiumScene />
 *   <YourOverlayVisualizations />
 * </CesiumOverlayProvider>
 * ```
 */
export function CesiumOverlayProvider({
  children,
}: CesiumOverlayProviderProps) {
  const { sceneRef } = useCesiumContext();
  const [scene, setScene] = useState<Scene | null>(null);
  
  // Registry of active visualizations
  const visualizationsRef = useRef<Map<string, VisualizationRegistration<any, any>>>(
    new Map()
  );
  
  // Input data for each visualization
  const visualizationDataRef = useRef<Map<string, any>>(new Map());
  
  // Tracked positions and their screen coordinates
  const screenPositionsRef = useRef<Map<string, ScreenPosition>>(new Map());

  // Sync scene reference from context
  useEffect(function syncSceneFromContext() {
    if (sceneRef.current) {
      setScene(sceneRef.current);
    }
  }, [sceneRef]);

  /**
   * Convert all tracked Cartesian3 positions to screen coordinates
   */
  const updateScreenPositions = useCallback(() => {
    if (!scene) return;

    const newScreenPositions = new Map<string, ScreenPosition>();

    // Collect all positions from all visualizations
    visualizationsRef.current.forEach((registration, vizId) => {
      const input = visualizationDataRef.current.get(vizId);
      if (!input) return;

      const positions = registration.extractPositions(input);
      positions.forEach((pos) => {
        const key = pos.id || `${vizId}_${positions.indexOf(pos)}`;
        const screenPos = cartesianToScreen(scene, pos.cartesian3);
        if (screenPos) {
          newScreenPositions.set(key, screenPos);
        }
      });
    });

    screenPositionsRef.current = newScreenPositions;
  }, [scene]);

  /**
   * Register a new visualization
   */
  const registerVisualization = useCallback(
    <TInput, TOutput>(registration: VisualizationRegistration<TInput, TOutput>) => {
      visualizationsRef.current.set(registration.id, registration);
    },
    []
  );

  /**
   * Unregister a visualization
   */
  const unregisterVisualization = useCallback((id: string) => {
    const registration = visualizationsRef.current.get(id);
    if (registration?.cleanup) {
      registration.cleanup();
    }
    visualizationsRef.current.delete(id);
    visualizationDataRef.current.delete(id);
  }, []);

  /**
   * Update input data for a visualization
   */
  const updateVisualization = useCallback(<TInput,>(id: string, input: TInput) => {
    visualizationDataRef.current.set(id, input);
    updateScreenPositions();
  }, [updateScreenPositions]);

  /**
   * Get screen position for a Cartesian3 coordinate
   */
  const getScreenPosition = useCallback(
    (cartesian3: Cartesian3): ScreenPosition | null => {
      if (!scene) return null;
      return cartesianToScreen(scene, cartesian3);
    },
    [scene]
  );

  // Update screen positions on every Cesium render
  // postRender fires after scene is rendered, providing real-time position updates
  // More responsive than camera.changed which can lag
  useEffect(function subscribeToPostRender() {
    if (!scene) return;
    if (visualizationsRef.current.size === 0) return;

    const removeListener = scene.postRender.addEventListener(() => {
      updateScreenPositions();
    });

    return () => {
      removeListener();
    };
  }, [scene, updateScreenPositions]);

  const contextValue: CesiumOverlayContextValue = {
    registerVisualization,
    unregisterVisualization,
    updateVisualization,
    getScreenPosition,
    scene,
  };

  return (
    <CesiumOverlayContext.Provider value={contextValue}>
      {children}
      {/* TODO: Render overlay layers (DOM/Canvas/SVG) */}
      <OverlayLayers />
    </CesiumOverlayContext.Provider>
  );
}

/**
 * Overlay rendering layers
 * TODO: Implement actual rendering based on registered visualizations
 */
function OverlayLayers() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {/* TODO: Render DOM visualizations */}
      {/* TODO: Render Canvas layer */}
      {/* TODO: Render SVG layer */}
    </div>
  );
}
