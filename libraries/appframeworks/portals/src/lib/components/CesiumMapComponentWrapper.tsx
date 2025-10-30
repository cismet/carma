import { ReactNode, useEffect, useRef, useCallback, useState } from "react";
import {
  CesiumSceneComponent,
  useCesiumContext,
} from "@carma/cesium/core";
import type { Scene } from "@carma/cesium";
import { usePortalContext } from "../contexts/PortalContext";
import { useCesiumSuspension } from "../hooks/use-cesium-suspension";
import { useCesiumEngineMethods } from "../hooks/use-cesium-engine-methods";

/**
 * Check if scene is valid (exists and not destroyed)
 */
const isValidScene = (scene: Scene | null): scene is Scene => {
  return !!scene && !scene.isDestroyed();
};

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
  console.groupCollapsed("[CesiumMapComponentWrapper] Component rendering");
  console.log("[CesiumMapComponentWrapper] Component rendering");
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  const mapContainer3dRef = useRef<HTMLDivElement | null>(null);
  const prevIsReadyRef = useRef<boolean>(false);
  // Transition visibility state - starts hidden, fades in when camera positioned
  const [isVisible, setIsVisible] = useState(false);

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
    getCurrentSceneStyle,
    setCurrentSceneStyle,
  } = useCesiumContext();

  // Get all engine methods (zoom, camera, style, debug)
  const {
    engineZoomIn,
    engineZoomOut,
    engineFovZoomIn,
    engineFovZoomOut,
    flyHome,
    setCamera,
    setStyle,
    debugInfo,
  } = useCesiumEngineMethods(portalConfig);

  const contextCamera = getCesiumCtxCamera();
  // Set initial camera state synchronously before scene renders

  if (contextCamera === null) {
    const initialCamera = getInitialCamera();

    if (initialCamera) {
      console.debug(
        "[CesiumMapComponentWrapper] Setting initial camera in context"
      );
      setCesiumCtxCamera(initialCamera);
    }
  } else {
    console.debug(
      "[CesiumMapComponentWrapper] Engine was already mounted leaving camera for reinitialization"
    );
  }

  // Gate: Only render scene when both camera and style are available in Cesium context
  const currentSceneStyle = getCurrentSceneStyle();
  
  const isSceneReady =
    contextCamera !== null && currentSceneStyle !== null;

  if (!isSceneReady) {
    console.debug("[CesiumMapComponentWrapper] Gate - Waiting ");
  }

  // Expose container getter for transition system (must be before initCesiumEngineRecord)
  const getContainer = useCallback(() => {
    return mapContainer3dRef.current;
  }, []);

  /**
   * Create or update Cesium engine record
   * This registers the engine with PortalContext so the portal context can provide unified style and map management
   */
  const initCesiumEngineRecord = useCallback(() => {
    const scene = sceneRef.current;
    const widget = widgetRef.current;

    // Scene is ready when it exists and is not destroyed, regardless of suspension
    // Suspension is about visibility/interactivity, NOT readiness
    const isValid = isValidScene(scene);

    if (!isValid) {
      console.debug("[CesiumMapComponentWrapper] Engine has no valid scene");
      return;
    }

    const isInitial = prevIsReadyRef.current === false;

    // skip on rerender if scene is not valid or is not initial
    if (!isInitial) {
      console.debug("[CesiumMapComponentWrapper] Engine is already ready");
      return;
    }

    console.log("[CesiumMapComponentWrapper] Engine readiness changed:", {
      isValid,
      hasScene: !!scene,
      hasWidget: !!widget,
    });

    prevIsReadyRef.current = true;

    console.log("[CesiumMapComponentWrapper] Resolution values at registration:", {
      widgetResolutionScale: widget.resolutionScale,
      scenePixelRatio: scene.pixelRatio,
      windowDevicePixelRatio: window.devicePixelRatio,
      usingScenePixelRatio: true,
    });

    // Register engine capabilities - suspension state managed by TransitionContext
    updateEngine("cesium3d", {
      isReady: true,
      isSuspended: true, // Start suspended in 2D mode (unsuspended by TransitionContext on 2D→3D)
      instance: () => sceneRef.current, // Store Scene getter for fresh access
      getResolutionScale: () => {
        const scene = sceneRef.current;
        // ONLY return pixelRatio (device DPR) - ignore widget.resolutionScale (performance setting)
        const pixelRatio = scene?.pixelRatio ?? 1.0;
        console.log("[CesiumMapComponentWrapper] getResolutionScale called:", {
          pixelRatio: pixelRatio,
          note: "Returning ONLY pixelRatio - resolutionScale is just a performance setting, not used for transitions",
        });
        return pixelRatio;
      },
      getContainer: getContainer, // Provide container for transition animations
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
    updateEngine,
    engineZoomIn,
    engineZoomOut,
    engineFovZoomIn,
    engineFovZoomOut,
    flyHome,
    setCamera,
    setStyle,
    getContainer,
    debugInfo,
  ]);

  // Update engine record reactively when scene or suspension state changes
  useEffect(() => {
    initCesiumEngineRecord();
  }, [initCesiumEngineRecord]);

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

  // Reset visibility when suspended (for next transition)
  useEffect(() => {
    if (isSuspended) {
      setIsVisible(false);
    }
  }, [isSuspended]);

  console.groupEnd();

  return (
    <div
      ref={mapContainer3dRef}
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
        // Smooth transition: hidden when suspended, fades in when visible
        opacity: isSuspended ? 0 : isVisible ? 1 : 0,
        transition: "opacity 300ms ease-in-out",
        pointerEvents: isSuspended || !isVisible ? "none" : "auto",
      }}
    >
      {/* leave the cesium container alone from css updates, use map-container-3d */}
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
