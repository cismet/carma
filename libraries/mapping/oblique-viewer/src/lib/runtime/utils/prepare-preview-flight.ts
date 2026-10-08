import type { Map as MaplibreMap } from "maplibre-gl";
import { acquireForegroundNetwork } from "@carma-mapping/engines/maplibre";
import { degToRad, type Degrees, type DevicePixels } from "@carma-units";
import { getCameraCalibration } from "../../core/utils/calibration";
import {
  originalOf,
  pyramidOf,
  type ObliqueViewportPhoto,
} from "./oblique-viewport-source";
import {
  fitNativePreviewView,
  nativePixelPool,
  nativePreviewSource,
  rememberNativePreviewView,
} from "./native-preview-pool";

/** Start the landing view during the flight, using the visible preview's pool. */
export const preparePreviewFlight = (
  map: MaplibreMap,
  photo: ObliqueViewportPhoto,
  rollDeg: Degrees
): (() => void) => {
  const calibration = getCameraCalibration(
    photo.dataset,
    photo.record.cameraId
  );
  const source = nativePreviewSource({
    imageId: photo.record.sourceId,
    path: photo.dataset.previewPath,
    sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
    avifPyramidUrl: pyramidOf(photo),
    avifOnly: photo.dataset.avifOnly,
    nativeSize: {
      width: calibration.widthPx as DevicePixels,
      height: calibration.heightPx as DevicePixels,
    },
    minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
  });
  const forecast = fitNativePreviewView(
    source,
    map.transform.width,
    map.transform.height,
    degToRad(rollDeg),
    window.devicePixelRatio || 1
  );
  rememberNativePreviewView(source, forecast.view, forecast.pixels);
  const releaseNetwork = acquireForegroundNetwork(
    map,
    "oblique-flight-preview"
  );
  let releasePixels: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    const lease = nativePixelPool.acquire(source);
    releasePixels = lease.release;
    const releaseWhenReady = () => {
      if (lease.stack.metrics.visibleReady) releaseNetwork();
    };
    unsubscribe = lease.stack.onContentChange(releaseWhenReady);
    lease.stack.setView(forecast.view, forecast.pixels);
    releaseWhenReady();
    void lease.stack.ready.catch(releaseNetwork);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unsubscribe?.();
      releaseNetwork();
      lease.release();
    };
  } catch {
    unsubscribe?.();
    releasePixels?.();
    releaseNetwork();
    // Preparation is optional; a missing source must never cancel navigation.
    return () => {};
  }
};
