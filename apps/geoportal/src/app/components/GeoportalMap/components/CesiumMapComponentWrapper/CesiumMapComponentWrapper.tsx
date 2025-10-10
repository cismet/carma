import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";

import type { FeatureInfo } from "@carma/types";

import {
  useSelectionCesium,
  useCesiumModels,
  DEFAULT_TILESET_IDS,
  DEFAULT_MARKER_KEYS,
} from "@carma-appframeworks/portals";

import {
  CustomViewer,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
  CtxEvent,
} from "@carma-mapping/engines/cesium";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";

import { useFeatureFlags } from "@carma-providers/feature-flag";

import { useModelSelectionDispatcher } from "../../../../hooks/useModelSelectionDispatcher.ts";
import { useObliqueInitializer } from "../../../../oblique/hooks/useObliqueInitializer.ts";
import { getBackgroundLayer } from "../../../../store/slices/mapping.ts";
import { useSyncCesiumSceneStyle } from "./hooks/useSyncCesiumSceneStyle";
import { useCesiumSceneChangedHandler } from "./hooks/useCesiumSceneChangedHandler";
import "cesium/Build/Cesium/Widgets/widgets.css";

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
  const {
    withTerrainProvider,
    withSurfaceProvider,
    subscribe,
    tilesetVisibilityRef,
    models,
  } = useCesiumContext();

  // Track mode via events to prevent re-renders from Redux
  const [isMode2d, setIsMode2d] = useState(!allow3d);
  const backgroundLayer = useSelector(getBackgroundLayer);

  // Read tileset visibility from context ref
  const showPrimaryTileset =
    tilesetVisibilityRef.current.get(DEFAULT_TILESET_IDS.PRIMARY) ?? true;

  // Subscribe to Cesium context events
  useEffect(() => {
    if (!allow3d) return; // If 3D not allowed, stay in 2D
    const unsubActivate = subscribe(CtxEvent.Activate, () => {
      console.debug("[CesiumWrapper] Cesium activate");
      setIsMode2d(false);
    });
    const unsubSuspend = subscribe(CtxEvent.Suspend, () => {
      console.debug("[CesiumWrapper] Cesium suspend");
      setIsMode2d(true);
    });
    return () => {
      unsubActivate();
      unsubSuspend();
    };
  }, [subscribe, allow3d]);

  const markerAsset =
    models?.[cesiumOptions.markerKey ?? DEFAULT_MARKER_KEYS.MARKER_GLOW_LINE];
  const markerAnchorHeight = cesiumOptions.markerAnchorHeight ?? 10;

  const flags = useFeatureFlags();
  const { isDebugMode } = flags;
  const { isObliqueMode } = useObliqueInitializer(isDebugMode);

  const cesiumInitialCameraView = useCesiumInitialCameraFromSearchParams();
  const modelSelectionDispatcher = useModelSelectionDispatcher();

  // Sync scene style with background layer selection
  useSyncCesiumSceneStyle(backgroundLayer);

  const onSceneChange = useCesiumSceneChangedHandler();

  const onSelect = useCallback(
    (feature: unknown) =>
      modelSelectionDispatcher(feature as FeatureInfo | null),
    [modelSelectionDispatcher]
  );

  const modelConfig = useMemo(
    () => ({
      models: cesiumOptions.models || emptyArr,
      enabled: flags.featureFlagBugaBridge && !isMode2d,
      selection: {
        enabled: flags.featureFlagBugaBridge && !isMode2d,
        deselectOnEmptyClick: true,
        onSelect,
      },
    }),
    [flags.featureFlagBugaBridge, isMode2d, cesiumOptions.models, onSelect]
  );

  useCesiumModels(modelConfig);

  const markerConfig = useMemo(
    () => ({
      markerAsset,
      markerAnchorHeight,
      isPrimaryStyle: showPrimaryTileset,
      withTerrainProvider,
      withSurfaceProvider,
    }),
    [
      markerAsset,
      markerAnchorHeight,
      showPrimaryTileset,
      withTerrainProvider,
      withSurfaceProvider,
    ]
  );

  useSelectionCesium(!isMode2d, markerConfig, isObliqueMode);

  if (!allow3d || cesiumInitialCameraView === null) {
    return null;
  }

  return (
    <div
      ref={container3dMapRef}
      className={"map-container-3d"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 400,
        opacity: isMode2d ? 0 : 1,
        transition: `opacity ${
          cesiumOptions.transitions?.mapMode?.duration ?? 1000
        }ms ease-in-out`,
        pointerEvents: isMode2d ? "none" : "auto",
      }}
    >
      <CustomViewer
        containerRef={container3dMapRef}
        cameraLimiterOptions={cesiumOptions.camera}
        initialCameraView={cesiumInitialCameraView}
        onSceneChange={onSceneChange}
      />
    </div>
  );
};

export default CesiumMapComponentWrapper;
