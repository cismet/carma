import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { useLeafletZoomControls } from "@carma-mapping/engines/leaflet";
import { useZoomControls } from "@carma-mapping/engines/cesium/core";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { usePortal } from "../contexts/PortalProvider";
import { ManagedEngineKeys } from "../constants";

interface UsePortalZoomControlsOptions {
  // Optional LibreMap ref for apps that use MapLibre in 2D mode
  libreMapRef?: MutableRefObject<{
    zoomIn: () => void;
    zoomOut: () => void;
  } | null>;
  // FOV mode for Cesium (oblique mode) - defaults to false
  fovMode?: boolean;
}

/**
 * usePortalZoomControls - Manages zoom logic for all map engines
 *
 * Automatically determines which engine to zoom based on:
 * - currentEngine from PortalContext (2D vs 3D)
 * - libreMapRef availability (MapLibre vs Leaflet in 2D mode)
 * - fovMode for Cesium oblique mode
 *
 * Returns callbacks that can be directly passed to UnifiedZoomControl.
 *
 * Example usage:
 * ```tsx
 * const { handleZoomIn, handleZoomOut } = usePortalZoomControls({
 *   libreMapRef,
 *   fovMode: isObliqueMode
 * });
 * <UnifiedZoomControl onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
 * ```
 */
export const usePortalZoomControls = (
  options?: UsePortalZoomControlsOptions
) => {
  const { libreMapRef, fovMode = false } = options || {};
  const { currentEngine } = usePortal();
  const { leafletMapRef } = useCarmaTopicMapContext();

  const isMode2d = currentEngine === ManagedEngineKeys.LEAFLET_2D;
  const hasLibreMap = libreMapRef?.current != null;

  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControls({ fovMode });

  const { zoomInLeaflet, zoomOutLeaflet } =
    useLeafletZoomControls(leafletMapRef);

  const handleZoomIn = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isMode2d) {
        if (hasLibreMap) {
          libreMapRef?.current?.zoomIn();
        } else {
          zoomInLeaflet?.();
        }
      } else {
        handleZoomInCesium?.(event);
      }
    },
    [isMode2d, hasLibreMap, libreMapRef, zoomInLeaflet, handleZoomInCesium]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isMode2d) {
        if (hasLibreMap) {
          libreMapRef?.current?.zoomOut();
        } else {
          zoomOutLeaflet?.();
        }
      } else {
        handleZoomOutCesium?.(event);
      }
    },
    [isMode2d, hasLibreMap, libreMapRef, zoomOutLeaflet, handleZoomOutCesium]
  );

  return {
    handleZoomIn,
    handleZoomOut,
  };
};
