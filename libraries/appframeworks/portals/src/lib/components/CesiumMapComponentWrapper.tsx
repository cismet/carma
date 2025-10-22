import { useEffect, useRef } from "react";

import {
  CesiumSceneComponent,
  useCesiumContext,
  CtxEvent,
} from "@carma-mapping/engines/cesium/core";
import { useTransitionContext } from "@carma-mapping/map-transition-2d-3d";

// useSelectionCesium REMOVED - use declarative <CesiumSelectionMarker /> from @carma-cesium/selections
// useCesiumModels REMOVED - use declarative <CesiumModel /> from @carma-cesium/models
import { useMapHashRoutingCesium } from "../hooks/useMapHashRoutingCesium";
import { useSyncCesiumSceneStyle } from "../hooks/useSyncCesiumSceneStyle";

/**
 * Cesium map component wrapper - mounts Cesium scene only after activation (2D→3D transition).
 * Config comes from CesiumContextProvider at app root level, not via props.
 */
export const CesiumMapComponentWrapper = () => {
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  const containerStyleRef = useRef<HTMLDivElement | null>(null);
  const { subscribe, activationCount } = useCesiumContext();
  const { config: transitionConfig } = useTransitionContext();

  // Get CSS fade durations from config
  const cssFadeInDurationMs =
    transitionConfig.modeTo3d?.step5_cssFadeIn?.durationMs ?? 1000;
  const cssFadeOutDurationMs =
    transitionConfig.modeTo2d?.step3_cssFadeOut?.durationMs ?? 1000;

  // Use refs to avoid re-renders - all state managed via event bus
  const isSuspendedRef = useRef(true); // Start suspended (2D mode)

  // Only render scene component after first activation (when switching to 3D)
  const shouldMountScene = activationCount > 0;

  console.log("[CesiumMapComponentWrapper] Render", {
    activationCount,
    shouldMountScene,
    hasContainer: !!cesiumContainerRef.current,
  });

  // Initial camera view handled via CesiumConfig in CesiumContextProvider
  // MapViewState (URL hash) is managed by useMapHashRoutingCesium hook

  // TODO: Initialize oblique mode - app-specific, should be passed as prop or hook
  // useObliqueInitializer(flags?.isDebugMode);

  // MODELS MANAGEMENT REMOVED:
  // Legacy Entity-based useCesiumModels() hook removed.
  // Use declarative <CesiumModel /> components from @carma-cesium/models instead.
  // These use scene primitives (not entities) and follow the widget/scene paradigm.
  //
  // Migration example:
  //   import { CesiumModel } from "@carma-cesium/models";
  //   {models.map(config => <CesiumModel key={...} config={config} visible={true} enabled={allow3d} />)}
  //
  // Model selection can be implemented via ScreenSpaceEventHandler in the component
  // or externally using scene.drillPick() for primitive-based picking.

  // MARKER/SELECTION MANAGEMENT REMOVED:
  // Legacy useSelectionCesium() hook removed (247 lines of complex state management).
  // Use declarative <CesiumSelectionMarker /> component from @carma-cesium/selections instead.
  //
  // Migration example:
  //   import { CesiumSelectionMarker } from "@carma-cesium/selections";
  //
  //   <CesiumSelectionMarker
  //     enabled={allow3d}
  //     markerConfig={{
  //       position: calculatedCartographic,
  //       groundPosition: groundCartographic,
  //       modelConfig: { uri: markerAssetUri, scale: 1.0 },
  //       stemline: { color: [1,0,0,1], width: 2 }
  //     }}
  //   />
  //
  // The new component:
  // - Uses scene primitives (not entities)
  // - Automatically subscribes to SelectionProvider
  // - Cleaner separation of concerns
  // - Apps handle position calculation (not buried in hook)

  // TODO: SCENE STYLE MANAGEMENT
  // - Reimplement scene style syncing via event bus
  // - Subscribe to background layer changes from Redux/state management
  // - Update scene style through CesiumContext.currentSceneStyleRef
  // - Should listen to a SceneStyleChange event instead
  // Sync Cesium scene style based on map style changes from MapStyleProvider context
  // This hook emits events to switch between LOD2 and Mesh scene styles
  useSyncCesiumSceneStyle();

  // Subscribe to suspend/activate events via event bus - update DOM directly without re-render
  useEffect(() => {
    const updateVisibility = (isSuspended: boolean) => {
      isSuspendedRef.current = isSuspended;
      if (containerStyleRef.current) {
        // Update transition duration based on direction
        const transitionDuration = isSuspended
          ? cssFadeOutDurationMs
          : cssFadeInDurationMs;
        containerStyleRef.current.style.transition = `opacity ${transitionDuration}ms ease-in-out`;
        containerStyleRef.current.style.opacity = isSuspended ? "0" : "1";
        containerStyleRef.current.style.pointerEvents = isSuspended
          ? "none"
          : "auto";
      }
    };

    // Set initial state (suspended in 2D mode)
    updateVisibility(true);

    const unsubActivate = subscribe(CtxEvent.Activate, () => {
      console.debug("[CesiumWrapper] Cesium activate (no fade-in yet)");
      isSuspendedRef.current = false; // Mark as active internally
      // Don't change opacity here - wait for SceneVisible after positioning
    });

    const unsubSceneVisible = subscribe(CtxEvent.SceneVisible, () => {
      console.debug("[CesiumWrapper] Scene visible - fade-in starts");
      updateVisibility(false); // Fade-in to visible
    });

    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      console.debug("[CesiumWrapper] Cesium suspend");
      updateVisibility(true); // Fade-out immediately
    });

    return () => {
      unsubActivate();
      unsubSceneVisible();
      unsubSuspend();
    };
  }, [subscribe, cssFadeInDurationMs, cssFadeOutDurationMs]);

  // Initialize Cesium camera change handler for hash routing
  const hashRoutingHandler = useMapHashRoutingCesium();

  // Adapt camera change to hash routing format
  const onCameraChanged = (params: { source: string; camera: any }) => {
    // TODO: Extract hash params from camera state
    hashRoutingHandler({ hashParams: {} });
  };

  return (
    <div
      ref={containerStyleRef}
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
        opacity: 0, // Initial state: hidden (updated by useEffect)
        transition: `opacity ${cssFadeOutDurationMs}ms ease-in-out`, // Initial: fade-out duration (updated by useEffect)
        pointerEvents: "none", // Initial state: no interaction (updated by useEffect)
      }}
    >
      {/* Cesium container - must have explicit dimensions for canvas sizing */}
      <div
        ref={cesiumContainerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Only mount CesiumSceneComponent after first activation (2D→3D transition)
            This prevents resource managers from initializing during cold 2D start */}
        {shouldMountScene && (
          <CesiumSceneComponent
            containerRef={cesiumContainerRef}
            onCameraChanged={onCameraChanged}
          />
        )}
      </div>
    </div>
  );
};

export default CesiumMapComponentWrapper;
