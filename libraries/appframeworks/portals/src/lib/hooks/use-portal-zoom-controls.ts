import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { useMapEngine } from "../contexts/PortalStateContext";
import { ManagedEngineKeys } from "../constants";

/**
 * Engine-specific zoom implementations provided by the app
 */
export interface ZoomImplementations {
  // Leaflet zoom (TopicMap)
  zoomInLeaflet?: () => void;
  zoomOutLeaflet?: () => void;

  // LibreMap zoom (if enabled in 2D mode)
  libreMapRef?: MutableRefObject<{
    zoomIn: () => void;
    zoomOut: () => void;
  } | null>;

  // Cesium zoom (3D mode) - supports both regular zoom and FOV zoom (oblique mode)
  zoomInCesium?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  zoomOutCesium?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * usePortalZoomControls - Routes zoom requests to active engine
 *
 * Portal handles the routing logic based on currentEngine.
 * App provides thin implementations via ZoomImplementations.
 *
 * This avoids circular dependencies by accepting callbacks instead
 * of importing engine hooks directly.
 *
 * @example
 * ```tsx
 * // In app (GeoportalControls)
 * const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls(leafletMapRef);
 *
 * // For Cesium: fovMode enables FOV-based zoom for oblique mode
 * const { handleZoomIn: zoomInCesium, handleZoomOut: zoomOutCesium } = useZoomControls({
 *   fovMode: isObliqueMode
 * });
 *
 * const { handleZoomIn, handleZoomOut } = usePortalZoomControls({
 *   zoomInLeaflet,
 *   zoomOutLeaflet,
 *   libreMapRef,
 *   zoomInCesium,
 *   zoomOutCesium,
 * });
 *
 * <UnifiedZoomControl onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
 * ```
 */
export const usePortalZoomControls = (implementations: ZoomImplementations) => {
  const { current: currentEngine } = useMapEngine();
  const {
    zoomInLeaflet,
    zoomOutLeaflet,
    libreMapRef,
    zoomInCesium,
    zoomOutCesium,
  } = implementations;

  const hasLibreMap = libreMapRef?.current != null;

  const handleZoomIn = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (currentEngine === ManagedEngineKeys.LEAFLET_2D) {
        // 2D mode: LibreMap or Leaflet
        if (hasLibreMap) {
          libreMapRef?.current?.zoomIn();
        } else {
          zoomInLeaflet?.();
        }
      } else {
        // 3D mode: Cesium
        zoomInCesium?.(event);
      }
    },
    [currentEngine, hasLibreMap, libreMapRef, zoomInLeaflet, zoomInCesium]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (currentEngine === ManagedEngineKeys.LEAFLET_2D) {
        // 2D mode: LibreMap or Leaflet
        if (hasLibreMap) {
          libreMapRef?.current?.zoomOut();
        } else {
          zoomOutLeaflet?.();
        }
      } else {
        // 3D mode: Cesium
        zoomOutCesium?.(event);
      }
    },
    [currentEngine, hasLibreMap, libreMapRef, zoomOutLeaflet, zoomOutCesium]
  );

  return {
    handleZoomIn,
    handleZoomOut,
  };
};
