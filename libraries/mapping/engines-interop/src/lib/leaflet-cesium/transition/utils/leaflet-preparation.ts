import type { Map as LeafletMap } from "leaflet";
import { isZoom } from "@carma-commons/units/helpers";
import { promiseWithTimeout } from "@carma-commons/utils/promise";
import { LeafletMapStateChangeEvents } from "@carma-mapping/engines/leaflet";

type LeafletPrepOptions = {
  maxZoom: number;
  zoomOutDuration: number;
  zoomOutEaseLinearity: number;
  zoomOutTimeoutBuffer: number;
};

/**
 * Prepares Leaflet map for transition by zooming out if needed
 * Pure function that returns a promise
 */
export const prepareLeafletForTransition = async (
  leaflet: LeafletMap | null | undefined,
  options: LeafletPrepOptions
): Promise<void> => {
  if (!leaflet) {
    return;
  }

  const {
    maxZoom,
    zoomOutDuration,
    zoomOutEaseLinearity,
    zoomOutTimeoutBuffer,
  } = options;
  const cleanups: Array<() => void> = [];

  const zoom = leaflet.getZoom();
  const shouldZoomOut = isZoom(zoom) && zoom > maxZoom;

  let moveEndPromise: Promise<void> | undefined;

  if (shouldZoomOut) {
    moveEndPromise = new Promise<void>((resolve) => {
      const handle = () => {
        leaflet.off(LeafletMapStateChangeEvents.zoomend, handle);
        resolve();
      };
      cleanups.push(() =>
        leaflet.off(LeafletMapStateChangeEvents.zoomend, handle)
      );
      leaflet.once(LeafletMapStateChangeEvents.zoomend, handle);
    });
  }

  leaflet.stop();

  try {
    if (shouldZoomOut && Number.isFinite(maxZoom)) {
      const durationMs = Math.max(0, zoomOutDuration);
      const durationSeconds = durationMs / 1000;
      leaflet.flyTo(leaflet.getCenter(), maxZoom, {
        duration: durationSeconds,
        animate: durationSeconds > 0,
        easeLinearity: zoomOutEaseLinearity,
      });
    }

    if (moveEndPromise) {
      const timeoutMs =
        Math.max(0, zoomOutDuration) + Math.max(0, zoomOutTimeoutBuffer);
      await promiseWithTimeout(moveEndPromise, timeoutMs);
    }
  } finally {
    cleanups.forEach((cleanup) => cleanup());
  }
};
