// @ts-nocheck
// TODO fix typescript for strict mode
import { useEffect, useRef } from "react";

import type { FeatureInfo } from "@carma/types";

import {
  CesiumSceneComponent,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
  CtxEvent,
} from "@carma-mapping/engines/cesium";

import { useFeatureFlags } from "@carma/providers/feature-flag";

import { useModelSelectionHandler } from "../hooks/useModelSelectionHandler";
import { useSelectionCesium } from "../hooks/useSelectionCesium";
import { useCesiumModels } from "../hooks/useCesiumModels";
import { useMapHashRoutingCesium } from "../hooks/useMapHashRoutingCesium";
import { useSyncCesiumSceneStyle } from "../hooks/useSyncCesiumSceneStyle";

// Config type for Cesium options
type CesiumConfig = {
  models?: unknown[];
  markerKey?: string;
  markerAnchorHeight?: number;
  transitions?: {
    mapMode?: {
      duration?: number;
    };
  };
  camera?: unknown;
};

type CesiumMapComponentWrapperProps = {
  allow3d?: boolean;
  cesiumOptions: Partial<CesiumConfig>;
};

const emptyArr = [];

export const CesiumMapComponentWrapper = ({
  allow3d,
  cesiumOptions,
}: CesiumMapComponentWrapperProps) => {
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const containerStyleRef = useRef<HTMLDivElement>(null);
  const { subscribe } = useCesiumContext();

  // Use refs to avoid re-renders - all state managed via event bus
  const isSuspendedRef = useRef(!allow3d);

  // One-time initialization - these hooks are called once at mount
  const cesiumInitialCameraView = useCesiumInitialCameraFromSearchParams();
  const flags = useFeatureFlags();
  const modelSelectionHandler = useModelSelectionHandler();

  // TODO: Initialize oblique mode - app-specific, should be passed as prop or hook
  // useObliqueInitializer(flags?.isDebugMode);

  // TODO: MODELS MANAGEMENT
  // - Reimplement useCesiumModels to work via event bus
  // - Subscribe to mode change events to enable/disable models dynamically
  // - Models should be managed through CesiumContext refs, not props/state
  // - Current implementation disabled to prevent re-renders
  const modelConfig = {
    models: cesiumOptions.models || emptyArr,
    enabled: flags?.featureFlagBugaBridge && allow3d,
    selection: {
      enabled: flags?.featureFlagBugaBridge && allow3d,
      deselectOnEmptyClick: true,
      onSelect: (feature: unknown) =>
        modelSelectionHandler(feature as FeatureInfo | null),
    },
  };
  useCesiumModels(modelConfig);

  // TODO: MARKER/SELECTION MANAGEMENT
  // - Reimplement marker asset loading from CesiumContext modelsRef
  // - Add terrain/surface provider refs to CesiumContext
  // - Add tileset visibility refs to CesiumContext
  // - Marker config should update via event bus when oblique mode changes
  // - Current markerAsset is undefined - was: models?.[cesiumOptions.markerKey ?? DEFAULT_MARKER_KEYS.MARKER_GLOW_LINE]
  const markerConfig = {
    markerAsset: undefined,
    markerAnchorHeight: cesiumOptions.markerAnchorHeight ?? 10,
    isPrimaryStyle: true,
  };
  useSelectionCesium(allow3d ?? false, markerConfig, false);

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

  // Initialize Cesium scene change handler for hash routing
  const onSceneChange = useMapHashRoutingCesium();

  if (!allow3d || cesiumInitialCameraView === null) {
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
        transition: `opacity ${
          cesiumOptions.transitions?.mapMode?.duration ?? 1000
        }ms ease-in-out`,
        pointerEvents: isSuspendedRef.current ? "none" : "auto",
      }}
    >
      <CesiumSceneComponent
        containerRef={container3dMapRef}
        cameraLimiterOptions={cesiumOptions.camera}
        initialCameraView={cesiumInitialCameraView}
        onSceneChange={onSceneChange}
      />
    </div>
  );
};

export default CesiumMapComponentWrapper;
