/* eslint-disable @nx/enforce-module-boundaries */
/* Lazy loading disabled for transition wiring - cesium/core imported directly */

import { ReactNode, useEffect, useRef, useCallback } from "react";
// eslint-disable-next-line carma/no-direct-cesium
import { CesiumSceneComponent, useCesiumContext } from "@carma/cesium/core";
import { usePortalContext } from "../contexts/PortalContext";
import { useCesiumStyleSync } from "../hooks/use-cesium-style-sync";
import type { CesiumEngineRecord } from "../types/map-engines";

/**
 * CesiumMapComponentWrapper - Portal-level wrapper for Cesium 3D scene
 *
 * ## RESPONSIBILITIES:
 * 
 * ### 1. Container Management
 * - Provide container element for Cesium scene
 * - Handle proper positioning and styling
 * 
 * ### 2. Style Synchronization
 * - Bridge portal MapStyleKey to Cesium scene styles
 * - Provide setStyle method for Cesium engine records
 * - Handle style changes during 2D↔3D transitions
 * 
 * ### 3. Engine Record Management
 * - Create/update Cesium engine record with proper setStyle method
 * - Register engine with PortalContext's enginesRef
 * - Handle engine readiness state changes
 * 
 * ### 4. Context Bridging
 * - Connect portal callbacks to Cesium context
 * - Coordinate activation/suspension between systems
 * 
 * ### 5. Hash Updates (for URL synchronization)
 * - Update URL hash when camera position changes
 * - Listen for navigation events and update Cesium camera
 * 
 * ## STATE MANAGEMENT:
 * - Scene handles its own activation/suspension via CesiumContext
 * - PortalContext manages all state (currentMapStyle, camera, etc.)
 * - Wrapper bridges callbacks and provides engine integration
 * - Camera initialization handled by CesiumContext from portal config
 * 
 * ## STYLE SYNC FLOW:
 * 1. PortalStateContext calls setMapStyle(styleId) for all engines
 * 2. Cesium engine's setStyle() calls useCesiumStyleSync().setStyle()
 * 3. useCesiumStyleSync handles ALL style logic:
 *    - Updates portal mapStyleRef
 *    - Detects changes via useEffect
 *    - Maps portal styles to Cesium styles
 *    - Applies to Cesium context via sceneStyleApplierRef
 * 
 * ## CLEAN SEPARATION:
 * - useCesiumStyleSync: ALL style logic (syncing + setStyle method)
 * - CesiumMapComponentWrapper: Just uses setStyle, no style logic
 * - PortalStateContext: Coordinates across engines
 * 
 * ## ADDITIONAL RESPONSIBILITIES TO IMPLEMENT:
 * 
 * ### Hash/URL Synchronization:
 
 * ### Error Handling:
 * reinit cesium on cesium crash
 * 
 * ### Memory Management:
 */
export const CesiumMapComponentWrapper = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);

  // Get portal context for engine management
  const { enginesRef, portalConfig } = usePortalContext();

  // Get Cesium context for scene coordination
  const {
    onSceneReadyCallbackRef: cesiumCallbackRef,
    isActive,
    isSuspendedRef,
  } = useCesiumContext();

  const { setStyle } = useCesiumStyleSync();

  /**
   * Create or update Cesium engine record
   * This registers the engine with PortalContext so the portal context can provide unified style and map management
   */
  const updateCesiumEngineRecord = useCallback(() => {
    console.log("[CesiumMapComponentWrapper] Updating Cesium engine record", {
      isActive,
      isSuspended: isSuspendedRef.current,
    });

    // Find existing Cesium engine record
    const engineIndex = enginesRef.current.findIndex(
      (engine) => engine.engine === "cesium3d"
    );

    const cesiumEngine: CesiumEngineRecord = {
      engine: "cesium3d",
      isReady: isActive as true,
      isSuspended: isSuspendedRef.current,
      zoomOut: () => {}, // TODO: Implement
      zoomIn: () => {}, // TODO: Implement
      flyHome: () => {}, // TODO: Implement
      setCamera: () => {}, // TODO: Implement
      setStyle: setStyle,
      debug: {
        config: portalConfig.cesium,
        timestamp: Date.now(),
      },
    };

    if (engineIndex >= 0) {
      // Update existing engine
      enginesRef.current[engineIndex] = cesiumEngine;
      console.log("[CesiumMapComponentWrapper] Updated existing Cesium engine");
    } else {
      //enginesRef.current.push(cesiumEngine);
      console.warn(
        "[CesiumMapComponentWrapper] multi engine support not implemented"
      );
    }
  }, [isActive, isSuspendedRef, setStyle, enginesRef, portalConfig.cesium]);

  // Update engine record when activation/suspension changes
  useEffect(() => {
    updateCesiumEngineRecord();
  }, [updateCesiumEngineRecord]);

  // Clean up engine record on unmount
  useEffect(() => {
    return () => {
      console.log(
        "[CesiumMapComponentWrapper] Cleaning up Cesium engine record"
      );
      enginesRef.current = enginesRef.current.filter(
        (engine) => engine.engine !== "cesium3d"
      );
    };
  }, [enginesRef]);

  return (
    <div
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <CesiumSceneComponent
          key="cesium-scene"
          containerRef={cesiumContainerRef}
        >
          {children}
        </CesiumSceneComponent>
      </div>
    </div>
  );
};

export default CesiumMapComponentWrapper;
