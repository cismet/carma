import { getCameraLocalMercatorFit } from "@carma-geo/proj";
import { distanceMeters } from "@carma-geo/utils";
import type { CssPixels, Degrees, Meters } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import type { SharedThreeSceneLocalFrame } from "../../core/shared-three-scene-types";
import { localFrameErrorPixels } from "../../core/local-frame-error";

const LOCAL_FRAME_MAX_ERROR_PIXELS = 0.5 as CssPixels;

export const createSharedSceneLocalFrame = (localFrameGroup: THREE.Group) => {
  let localFrame: SharedThreeSceneLocalFrame | null = null;
  /**
   * Fit the local frame at the current map centre. The frame is kept while
   * the current view would show at most `LOCAL_FRAME_MAX_ERROR_PIXELS` from
   * it, so the runtimes and lights mounted on it are not disturbed on every
   * pan frame; `force` refits regardless, on attach.
   */
  const refit = (
    map: MaplibreMap | null,
    originLngLat: readonly [number, number] | null,
    force = false
  ): SharedThreeSceneLocalFrame | null => {
    if (!map || !originLngLat) return localFrame;
    const center = map.getCenter();
    const lngLat: readonly [number, number] = [center.lng, center.lat];
    if (
      !force &&
      localFrame &&
      localFrameErrorPixels(
        distanceMeters(
          {
            longitude: localFrame.lngLat[0] as Degrees,
            latitude: localFrame.lngLat[1] as Degrees,
          },
          { longitude: center.lng as Degrees, latitude: center.lat as Degrees }
        ) as Meters,
        center.lat as Degrees,
        map.getZoom?.() ?? 16,
        (map.getPitch?.() ?? 0) as Degrees,
        (map.getCanvas?.()?.clientWidth || 1920) as CssPixels
      ) <= LOCAL_FRAME_MAX_ERROR_PIXELS
    ) {
      return localFrame;
    }
    const sceneFromLocal = getCameraLocalMercatorFit(
      [originLngLat[0], originLngLat[1]],
      [lngLat[0], lngLat[1]],
      { correctEllipsoidMetric: true }
    );
    const referenceLngLat = localFrame?.referenceLngLat ?? lngLat;
    const sceneFromLocalReference =
      localFrame?.sceneFromLocalReference ?? sceneFromLocal;
    const referenceToCurrent = localFrame
      ? sceneFromLocal
          .clone()
          .multiply(sceneFromLocalReference.clone().invert())
      : new THREE.Matrix4();
    localFrame = {
      lngLat,
      revision: (localFrame?.revision ?? 0) + 1,
      sceneFromLocal,
      sceneFromLocalRotation: new THREE.Matrix4().extractRotation(
        sceneFromLocal
      ),
      referenceLngLat,
      sceneFromLocalReference,
      referenceToCurrent,
      currentToReference: referenceToCurrent.clone().invert(),
    };
    localFrameGroup.matrix.copy(referenceToCurrent);
    localFrameGroup.updateMatrixWorld(true);
    return localFrame;
  };

  return {
    refit,
    get current() {
      return localFrame;
    },
    reset() {
      localFrame = null;
    },
  };
};
