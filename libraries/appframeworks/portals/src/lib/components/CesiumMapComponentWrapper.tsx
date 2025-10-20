import { useEffect, useRef } from "react";

import {
  CesiumSceneComponent,
  useCesiumContext,
  CtxEvent,
  type CesiumConfig,
} from "@carma-mapping/engines/cesium/core";

// useSelectionCesium REMOVED - use declarative <CesiumSelectionMarker /> from @carma-cesium/selections
// useCesiumModels REMOVED - use declarative <CesiumModel /> from @carma-cesium/models
import { useMapHashRoutingCesium } from "../hooks/useMapHashRoutingCesium";
import { useSyncCesiumSceneStyle } from "../hooks/useSyncCesiumSceneStyle";

type CesiumMapComponentWrapperProps = {
  allow3d?: boolean;
  cesiumOptions: Partial<CesiumConfig>;
};

export const CesiumMapComponentWrapper = ({
  allow3d,
  cesiumOptions,
}: CesiumMapComponentWrapperProps) => {
  const container3dMapRef = useRef<HTMLDivElement | null>(null);
  const containerStyleRef = useRef<HTMLDivElement | null>(null);
  const { subscribe } = useCesiumContext();

  // Use refs to avoid re-renders - all state managed via event bus
  const isSuspendedRef = useRef(!allow3d);

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
    if (!allow3d) return;

    const updateVisibility = (isSuspended: boolean) => {
      isSuspendedRef.current = isSuspended;
      if (containerStyleRef.current) {
        containerStyleRef.current.style.opacity = isSuspended ? "0" : "1";
        containerStyleRef.current.style.pointerEvents = isSuspended
          ? "none"
          : "auto";
      }
    };

    const unsubActivate = subscribe(CtxEvent.Activate, () => {
      console.debug("[CesiumWrapper] Cesium activate");
      updateVisibility(false);
    });
    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      console.debug("[CesiumWrapper] Cesium suspend");
      updateVisibility(true);
    });

    return () => {
      unsubActivate();
      unsubSuspend();
    };
  }, [subscribe, allow3d]);

  // Initialize Cesium camera change handler for hash routing
  const hashRoutingHandler = useMapHashRoutingCesium();

  // Adapt camera change to hash routing format
  const onCameraChanged = (params: { source: string; camera: any }) => {
    // TODO: Extract hash params from camera state
    hashRoutingHandler({ hashParams: {} });
  };

  if (!allow3d) {
    return null;
  }

  return (
    <div
      ref={(node) => {
        container3dMapRef.current = node;
        containerStyleRef.current = node;
      }}
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
        opacity: isSuspendedRef.current ? 0 : 1,
        // Transition managed by map-transition-2d-3d library
        pointerEvents: isSuspendedRef.current ? "none" : "auto",
      }}
    >
      <CesiumSceneComponent
        containerRef={container3dMapRef}
        onCameraChanged={onCameraChanged}
      />
    </div>
  );
};

export default CesiumMapComponentWrapper;
