import { useCallback, useEffect } from "react";
import { useHashState } from "@carma-appframeworks/portals";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium/core";

export type CesiumSceneChangeEvent = { hashParams: Record<string, string> };

export const triggerCesiumSceneChangeEvent = (
  hashParams: Record<string, string> | null | undefined,
  handler: (e: CesiumSceneChangeEvent) => void
): void => {
  if (!hashParams) return;
  try {
    handler({ hashParams });
  } catch {
    console.warn("Triggering Cesium scene change event failed");
  }
};

/**
 * Portal-level hook: Syncs Cesium camera position to URL hash.
 * Analog to useMapHashRoutingLeafletLike for 2D maps.
 *
 * Subscribes to CameraMoveend events - final navigable camera state:
 * - Fires when camera/FOV stops moving (debounced 500ms, like Leaflet moveend)
 * - Also fires when FOV animations complete
 * - NOT during transitions or active user panning
 * - NOT influenced by scene/map style changes (those are handled separately)
 *
 * Always removes zoom key when updating (3D mode uses lat/lng/h instead).
 */
export const useMapHashRoutingCesium = (clearKeys = ["zoom"]) => {
  const { updateHash } = useHashState();
  const { subscribe, isSuspendedRef } = useCesiumContext();

  // Subscribe to CameraMoveend events (final navigable state, not during transitions/pans)
  useEffect(() => {
    const unsubCameraMoveend = subscribe(
      CtxEvent.CameraMoveend,
      (cameraData) => {
        // Don't update hash if Cesium is suspended (in 2D mode)
        if (isSuspendedRef.current) {
          console.debug(
            "[CesiumHashRouting] Skipping hash update - Cesium suspended"
          );
          return;
        }

        // Update URL hash with camera position (moveend equivalent)
        const hashParams: Record<string, string | number | undefined> = {
          lat: cameraData.lat.toFixed(7),
          lng: cameraData.lng.toFixed(7),
          h: cameraData.alt.toFixed(1),
        };

        updateHash(hashParams, {
          clearKeys, // Remove zoom key by default when in 3D mode
          label: "useMapHashRoutingCesium:cameraMoveend",
          replace: true, // Don't push to history, just update
        });
      }
    );

    return () => unsubCameraMoveend();
  }, [subscribe, updateHash, isSuspendedRef, clearKeys]);

  // Return callback for backward compatibility (if needed)
  const handleCesiumSceneChange = useCallback(
    (e: CesiumSceneChangeEvent) => {
      // Don't update hash if Cesium is suspended (in 2D mode)
      if (isSuspendedRef.current) {
        console.debug(
          "[CesiumHashRouting] Skipping hash update - Cesium suspended"
        );
        return;
      }

      updateHash(e.hashParams, {
        clearKeys,
        label: "useMapHashRoutingCesium:manual",
        replace: true,
      });
    },
    [updateHash, clearKeys, isSuspendedRef]
  );

  return handleCesiumSceneChange;
};
