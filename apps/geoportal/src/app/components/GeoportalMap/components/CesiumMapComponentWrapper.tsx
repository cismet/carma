import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import {
  CustomViewer,
  selectShowPrimaryTileset,
  selectViewerIsMode2d,
  selectViewerModels,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
} from "@carma-mapping/engines/cesium";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";

import { useFeatureFlags } from "@carma-providers/feature-flag";

import {
  useSelectionCesium,
  useCesiumModels,
} from "@carma-appframeworks/portals";
import type { FeatureInfo } from "@carma/types";

import { useModelSelectionDispatcher } from "../../../hooks/useModelSelectionDispatcher.ts";
import { useObliqueInitializer } from "../../../oblique/hooks/useObliqueInitializer.ts";

type CesiumMapComponentWrapperProps = {
  allow3d?: boolean;
  cesiumOptions: Partial<CesiumConfig>;
  onSceneChange: (e: { hashParams: Record<string, string> }) => void;
};

export default function CesiumMapComponentWrapper({
  allow3d,
  cesiumOptions,
  onSceneChange,
}: CesiumMapComponentWrapperProps) {
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const { withTerrainProvider, withSurfaceProvider } = useCesiumContext();

  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;
  const showPrimaryTileset = useSelector(selectShowPrimaryTileset);
  const models = useSelector(selectViewerModels);

  const markerAsset = models[cesiumOptions.markerKey ?? "MarkerGlowLine"];
  const markerAnchorHeight = cesiumOptions.markerAnchorHeight ?? 10;

  const flags = useFeatureFlags();
  const { isDebugMode } = flags;
  const { isObliqueMode } = useObliqueInitializer(isDebugMode);

  const cesiumInitialCameraView = useCesiumInitialCameraFromSearchParams();
  const modelSelectionDispatcher = useModelSelectionDispatcher();

  const modelConfig = useMemo(
    () => ({
      models: cesiumOptions.models || [],
      enabled: flags.featureFlagBugaBridge && !isMode2d,
      selection: {
        enabled: flags.featureFlagBugaBridge && !isMode2d,
        deselectOnEmptyClick: true,
        onSelect: (feature: unknown) =>
          modelSelectionDispatcher(feature as FeatureInfo | null),
      },
    }),
    [
      flags.featureFlagBugaBridge,
      isMode2d,
      modelSelectionDispatcher,
      cesiumOptions.models,
    ]
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
}
