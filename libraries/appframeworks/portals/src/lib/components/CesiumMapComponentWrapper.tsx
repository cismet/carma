
import { ReactNode, useEffect, useRef, useCallback, useMemo } from "react";
import {
  CesiumSceneComponent,
  useCesiumContext,
  useZoomControls,
} from "@carma/cesium/core";
import { usePortalContext } from "../contexts/PortalContext";
import { useCesiumStyleSync } from "../hooks/use-cesium-style-sync";
import { useCesiumSuspension } from "../hooks/use-cesium-suspension";
import {
  CameraState,
  setViewFromCameraState,
} from "@carma/mapping/engines/cesium/api";

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
  console.log("[CesiumMapComponentWrapper] Component rendering");
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);

  // Get portal context for engine management
  const {
    portalConfig,
    updateEngine,
    getHomeCamera,
    getCamera: getInitialCamera,
    getEngines,
  } = usePortalContext();

  // Get Cesium context for scene coordination
  const {
    widgetRef,
    sceneRef,
    getCamera: getCesiumCtxCamera,
    setCamera: setCesiumCtxCamera,
    currentSceneStyleRef,
  } = useCesiumContext();

  // also set style from portal context to cesium context
  const { setStyle } = useCesiumStyleSync();

  // Get zoom controls for engine record
  const { handleZoomIn: zoomIn, handleZoomOut: zoomOut } = useZoomControls({
    fovMode: false,
  });
  const { handleZoomIn: fovZoomIn, handleZoomOut: fovZoomOut } =
    useZoomControls({ fovMode: true });

  /**
   * Fly to home camera position
   */
  const flyHome = useCallback(
    (onComplete?: () => void) => {
      console.debug("[CesiumMapComponentWrapper] Engine flyHome called");

      const widget = widgetRef.current;
      if (!widget) {
        console.warn(
          "[CesiumMapComponentWrapper] No widget available for flyHome"
        );
        onComplete?.();
        return;
      }

      const homeCamera = getHomeCamera();
      if (!homeCamera) {
        console.warn("[CesiumMapComponentWrapper] No home camera available");
        onComplete?.();
        return;
      }

      const { camera } = widget;
      if (!camera) {
        console.warn(
          "[CesiumMapComponentWrapper] No camera available for flyHome"
        );
        onComplete?.();
        return;
      }

      console.log("[CesiumMapComponentWrapper] TODO: flyHome not implemented");

      console.debug("[CesiumMapComponentWrapper] FlyHome completed");
      onComplete?.();
    },
    [widgetRef, getHomeCamera]
  );

  /**
   * Set camera from CameraState (for transitions)
   */
  const setCamera = useCallback(
    (camera: CameraState) => {
      console.debug("[CesiumMapComponentWrapper] setCamera called", camera);
      const widget = widgetRef.current;
      if (!widget?.camera) {
        console.warn(
          "[CesiumMapComponentWrapper] No camera available for setCamera"
        );
        return;
      }
      // Apply camera state
      setViewFromCameraState(widget.camera, camera);
    },
    [widgetRef]
  );

  const engineZoomOut = useCallback(
    (onComplete?: () => void) => {
      console.debug("[CesiumMapComponentWrapper] Engine zoomOut called");
      zoomOut({ preventDefault: () => {}, stopPropagation: () => {} } as any);
      onComplete?.();
    },
    [zoomOut]
  );

  const engineZoomIn = useCallback(
    (onComplete?: () => void) => {
      console.debug("[CesiumMapComponentWrapper] Engine zoomIn called");
      zoomIn({ preventDefault: () => {}, stopPropagation: () => {} } as any);
      onComplete?.();
    },
    [zoomIn]
  );

  const engineFovZoomOut = useCallback(
    (onComplete?: () => void) => {
      console.debug("[CesiumMapComponentWrapper] Engine fovZoomOut called");
      fovZoomOut({
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any);
      onComplete?.();
    },
    [fovZoomOut]
  );

  const engineFovZoomIn = useCallback(
    (onComplete?: () => void) => {
      console.debug("[CesiumMapComponentWrapper] Engine fovZoomIn called");
      fovZoomIn({ preventDefault: () => {}, stopPropagation: () => {} } as any);
      onComplete?.();
    },
    [fovZoomIn]
  );

  const debugInfo = useMemo(
    () => ({
      config: portalConfig.cesium,
      timestamp: Date.now(),
    }),
    [portalConfig.cesium]
  );

  // Track previous isReady state to prevent unnecessary updates
  const prevIsReadyRef = useRef<boolean>(false);

  const contextCamera = getCesiumCtxCamera();
  // Set initial camera state synchronously before scene renders

  if (contextCamera === null) {
    const initialCamera = getInitialCamera();

    console.debug(
      "[CesiumMapComponentWrapper] Setting initial camera in context"
    );
    setCesiumCtxCamera(initialCamera);
  } else {
    console.debug(
      "[CesiumMapComponentWrapper] Engine was already mounted leaving camera for reinitialization"
    );
  }

  // Gate: Only render scene when both camera and style are available in Cesium context
  const isSceneReady =
    contextCamera !== null && currentSceneStyleRef.current !== null;

  if (!isSceneReady) {
    console.debug(
      "[CesiumMapComponentWrapper] Gate - Waiting for camera and style to be available",
      {
        hasCamera: contextCamera !== null,
        hasStyle: currentSceneStyleRef.current !== null,
      }
    );
  }

  /**
   * Create or update Cesium engine record
   * This registers the engine with PortalContext so the portal context can provide unified style and map management
   */
  const updateCesiumEngineRecord = useCallback(() => {
    const scene = sceneRef.current;
    const widget = widgetRef.current;

    // Get current suspension state from PortalContext (single source of truth)
    const engines = getEngines();
    const cesiumEngine = engines.find((e) => e.engine === "cesium3d");
    const isSuspended = cesiumEngine?.isSuspended ?? true;

    const isValid = !isSuspended && !!scene && !scene.isDestroyed();

    const isInitial = isValid && !prevIsReadyRef.current;

    // Skip update if isReady state hasn't changed
    if (prevIsReadyRef.current === isValid) {
      return;
    }

    prevIsReadyRef.current = isValid;

    isValid &&
      isInitial &&
      updateEngine("cesium3d", {
        isReady: isValid as true,
        isSuspended: isSuspended,
        instance: widget, // Add the actual Cesium widget instance
        zoomOut: engineZoomOut,
        zoomIn: engineZoomIn,
        fovZoomOut: engineFovZoomOut,
        fovZoomIn: engineFovZoomIn,
        flyHome: flyHome,
        setCamera: setCamera,
        setStyle: setStyle,
        debug: debugInfo,
      });
  }, [
    getEngines,
    sceneRef,
    widgetRef,
    setStyle,
    updateEngine,
    debugInfo,
    flyHome,
    setCamera,
    engineZoomIn,
    engineZoomOut,
    engineFovZoomIn,
    engineFovZoomOut,
  ]);

  // Update engine record reactively when scene or suspension state changes
  useEffect(() => {
    updateCesiumEngineRecord();
  }, [updateCesiumEngineRecord]);

  // Clean up engine record on unmount
  // NOTE: We don't call updateEngine here because it would trigger a re-render
  // which causes the component to remount, creating an infinite loop.
  // The engine record will be cleaned up when the component actually unmounts for good.
  useEffect(() => {
    return () => {
      console.log("[CesiumMapComponentWrapper] Component unmounting");
    };
  }, []);

  // Handle suspension state - hide/show imagery layers to save resources
  const isSuspended = useCesiumSuspension();

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
        // Debug: Show 50% opacity when suspended
        opacity: isSuspended ? 0.5 : 1,
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
