import { useCallback, useEffect } from "react";
import { useSelector } from "react-redux";

import {
  useCesiumContext,
  selectShowSecondaryTileset,
  encodeCesiumCamera,
  type StringifiedCameraState,
  VIEWERSTATE_KEYS,
} from "@carma-mapping/engines/cesium";
import {
  useMapHashRoutingCesium,
  triggerCesiumSceneChangeEvent,
} from "@carma-appframeworks/portals";

const toHashParams = (
  cesiumCameraState: StringifiedCameraState,
  metadata: Record<string, string | boolean>
) => {
  return cesiumCameraState.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, metadata as Record<string, string>);
};

/**
 * Geoportal-specific Cesium scene change handler.
 * Analog to useTopicMapLocationChangedHandler for Leaflet.
 * Triggers synthetic scene change when enabling (switching to 3D mode).
 */
export const useCesiumSceneChangedHandler = (enabled: boolean) => {
  const { withCamera } = useCesiumContext();
  const isSecondaryStyle = useSelector(selectShowSecondaryTileset);

  const handleCesiumSceneChange = useMapHashRoutingCesium(enabled);

  const getCesiumHashParams = useCallback(() => {
    let cameraState: StringifiedCameraState | null = null;
    withCamera((camera) => {
      cameraState = encodeCesiumCamera(camera);
    });
    if (!cameraState) return null;

    const metadata = {
      [VIEWERSTATE_KEYS.mapStyle]: isSecondaryStyle ? "0" : "1",
      [VIEWERSTATE_KEYS.is3d]: "1", // Always 3D when Cesium is active
    };

    return toHashParams(cameraState, metadata);
  }, [withCamera, isSecondaryStyle]);

  // Trigger synthetic scene change when enabling (switching to 3D mode)
  useEffect(() => {
    if (enabled) {
      const hashParams = getCesiumHashParams();
      if (hashParams) {
        triggerCesiumSceneChangeEvent(hashParams, handleCesiumSceneChange);
      }
    }
  }, [enabled, getCesiumHashParams, handleCesiumSceneChange]);

  return handleCesiumSceneChange;
};
