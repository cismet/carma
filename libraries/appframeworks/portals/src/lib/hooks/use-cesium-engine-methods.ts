import { useCallback, useMemo } from "react";
import { useCesiumContext, useZoomControls } from "@carma/cesium/core";
import {
  CameraState,
  setViewFromCameraState,
} from "@carma/mapping/engines/cesium/api";
import { usePortalContext } from "../contexts/PortalContext";
import { useCesiumStyleSync } from "./use-cesium-style-sync";
import type { PortalConfig } from "../types/portal";

/**
 * Custom hook that provides all Cesium engine methods for PortalContext engine registration
 * 
 * Encapsulates:
 * - Zoom controls (normal + FOV mode)
 * - Camera controls (flyHome, setCamera)
 * - Style management
 * - Debug info
 */
export const useCesiumEngineMethods = (portalConfig: PortalConfig) => {
  const { widgetRef } = useCesiumContext();
  const { getHomeCamera } = usePortalContext();
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

  return {
    // Zoom controls
    engineZoomIn,
    engineZoomOut,
    engineFovZoomIn,
    engineFovZoomOut,
    // Camera controls
    flyHome,
    setCamera,
    // Style management
    setStyle,
    // Debug
    debugInfo,
  };
};
