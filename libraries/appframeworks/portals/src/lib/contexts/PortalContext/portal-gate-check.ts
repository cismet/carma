import type { MutableRefObject } from "react";

import type { PortalConfig } from "../../types/portal";
import type { EngineRecords } from "../../types/map-engines";
import type { MapStyleKey } from "../../constants";
import type { MapView } from "@carma-mapping/engines/leaflet";
import type { CameraState } from "@carma/cesium";

export interface PortalRenderState {
  ready: boolean;
  reason: string;
}

interface PortalGateInputs {
  config: PortalConfig;
  readyStateCacheRef: MutableRefObject<PortalRenderState | null>;
  isPortalInitializedRef: MutableRefObject<boolean | null>;
  enginesRef: MutableRefObject<EngineRecords>;
  mapStyleRef: MutableRefObject<MapStyleKey | null>;
  viewRef: MutableRefObject<MapView | null>;
  cameraRef: MutableRefObject<CameraState | null>;
  homeViewRef: MutableRefObject<MapView | null>;
  homeCameraRef: MutableRefObject<CameraState | null>;
}

export const evaluatePortalGate = ({
  config,
  readyStateCacheRef,
  isPortalInitializedRef,
  enginesRef,
  mapStyleRef,
  viewRef,
  cameraRef,
  homeViewRef,
  homeCameraRef,
}: PortalGateInputs): PortalRenderState => {
  console.groupCollapsed("[PortalStateProvider] Gate Check");

  try {
    const cachedState = readyStateCacheRef.current;
    if (cachedState?.ready) {
      console.debug("Using cached READY state (stable)");
      return cachedState;
    }

    if (!isPortalInitializedRef.current) {
      console.debug("Gate FAILED: hash not initialized", {
        isPortalInitialized: isPortalInitializedRef.current,
      });
      return { ready: false, reason: "hash not initialized" };
    }

    if (!enginesRef.current || enginesRef.current.length === 0) {
      console.debug("Gate FAILED: no engines configured", {
        enginesCount: enginesRef.current?.length ?? 0,
      });
      return { ready: false, reason: "no engines configured" };
    }

    const allEnginesSuspended = enginesRef.current.every(
      (engine) => engine.isSuspended
    );
    if (allEnginesSuspended) {
      console.warn(
        "Gate WARNING: All engines are suspended. At least one engine should be active for normal operation."
      );
    }

    if (!mapStyleRef.current) {
      console.debug("Gate FAILED: no style selected");
      return { ready: false, reason: "no style selected" };
    }

    if (!homeViewRef.current && !homeCameraRef.current) {
      console.debug("Gate FAILED: no home view or camera configured");
      return { ready: false, reason: "no home view/camera set" };
    }

    if (!viewRef.current && !cameraRef.current) {
      console.debug("Gate FAILED: no current view or camera configured");
      return { ready: false, reason: "no current view/camera set" };
    }

    const hasConfigured2d = Boolean(config.leaflet);
    if (hasConfigured2d && !viewRef.current) {
      console.debug("Gate FAILED: 2D configured but view is missing");
      return { ready: false, reason: "2D configured but no view" };
    }

    const hasConfigured3d = Boolean(config.cesium);
    if (hasConfigured3d && !cameraRef.current) {
      console.debug("Gate FAILED: 3D configured but camera is missing");
      return { ready: false, reason: "3D camera not ready" };
    }

    const result: PortalRenderState = { ready: true, reason: "ready" };

    readyStateCacheRef.current = result;

    console.debug("Gate PASSED: All requirements met", {
      hasConfigured2d,
      hasConfigured3d,
      mapStyle: mapStyleRef.current,
      viewReady: Boolean(viewRef.current),
      cameraReady: Boolean(cameraRef.current),
      homeViewReady: Boolean(homeViewRef.current),
      homeCameraReady: Boolean(homeCameraRef.current),
    });

    return result;
  } finally {
    console.groupEnd();
  }
};
