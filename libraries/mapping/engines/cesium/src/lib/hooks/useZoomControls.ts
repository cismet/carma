import { useCallback } from "react";

import {
  Cartesian2,
  Cartesian3,
  EasingFunction,
  Math as CesiumMath,
  Ray,
  PerspectiveFrustum,
} from "cesium";
import { cancelAnimation } from "../utils/AnimationMap";
import { cesiumAnimateFov } from "../utils/cesiumAnimateFov";
import type { CesiumContextType } from "../CesiumContext";
import { sceneHasTweens } from "../utils/sceneHasTweens";

const FOV_MOVERATE_FACTOR = 0.5;

type ZoomOptions = {
  duration?: number;
  moveRateFactor?: number;
  fovMode?: boolean;
};

// Value to subtract from the globe distance to get the minimum zoom distance when not over scene content
// Should be significantly over maximum elevations of area of interest to prevent camera going under the surface
const FALLBACK_MIN_DISTANCE_TO_GLOBE = 2500;

const defaultZoomOptions: Required<ZoomOptions> = {
  duration: 0.5,
  moveRateFactor: 1,
  fovMode: false,
};

const zoom = (
  ctx: CesiumContextType,
  isZoomOut = false,
  duration: number,
  moveRateFactor: number
): void => {
  ctx.withWidget((w) => {
    let wasCancelled = false;
    if (!ctx.AnimationMapRef.current) return;

    if (ctx.AnimationMapRef.current.get(w)) {
      cancelAnimation(w, ctx.AnimationMapRef.current);
      wasCancelled = true;
    } // TODO: replace with a public API when one is available to check for ongoing flyTo animations

    const camera = w.camera;
    const scene = w.scene;
    const canvas = w.canvas;
    const globe = w.scene.globe;

    if (sceneHasTweens(viewer)) {
      camera.completeFlight();
      console.debug("completing previous zoom or other flyTo animation");
      wasCancelled = true;
    }

    const screenCenter = new Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2
    );

    const scenePickPosition = scene.pickPosition(screenCenter);

    const pickRay = camera.getPickRay(screenCenter);

    const cameraPosition = camera.position;

    if (!pickRay) return;

    const globePickPosition = pickRay && globe.pick(pickRay, scene);

    let globeDistance: number | undefined = undefined;
    if (globePickPosition) {
      globeDistance = Cartesian3.distance(cameraPosition, globePickPosition);
    }

    const sceneDistance =
      scenePickPosition &&
      Cartesian3.distance(cameraPosition, scenePickPosition);

    let distance;

    if (sceneDistance !== undefined) {
      distance = sceneDistance;
    } else if (globeDistance !== undefined) {
      distance = globeDistance - FALLBACK_MIN_DISTANCE_TO_GLOBE;
    } else {
      return;
    }

    const maxDistance = scene.screenSpaceCameraController.maximumZoomDistance;
    const minDistance = scene.screenSpaceCameraController.minimumZoomDistance;
    if (maxDistance === undefined || maxDistance === Number.POSITIVE_INFINITY) {
      console.warn(
        "Cesium maximumZoomDistance is undefined or infinite, zooming may not work as expected, set maximumZoomDistance in cesium config for ScreenSpaceCameraController"
      );
    }
    if (minDistance === undefined || minDistance === 0) {
      console.warn(
        "Cesium minimumZoomDistance is undefined or 0, zooming may not work as expected, set minimumZoomDistance in cesium config for ScreenSpaceCameraController"
      );
    }

    let offsetOnRay = isZoomOut
      ? -distance * moveRateFactor
      : (distance * 0.5) / moveRateFactor;

    // Clamp to maxDistance
    if (distance - offsetOnRay > maxDistance) {
      offsetOnRay = distance - maxDistance;
    }

    // Clamp to minDistance
    if (distance - offsetOnRay < minDistance) {
      offsetOnRay = distance - minDistance;
    }

    // Move the camera along the ray
    const newPosition = Ray.getPoint(pickRay, offsetOnRay, new Cartesian3());
    ctx.withCamera((camera) => {
      camera.flyTo({
        destination: newPosition,
        orientation: {
          heading: camera.heading,
          pitch: camera.pitch,
          roll: camera.roll,
        },
        duration: duration,
        easingFunction: wasCancelled
          ? EasingFunction.QUADRATIC_OUT
          : EasingFunction.QUADRATIC_IN_OUT,
      });
    });
  });
};

const fovZoom = (
  ctx: CesiumContextType,
  zoomIn: boolean,
  duration: number,
  moveRateFactor: number,
  maxFov: number = CesiumMath.toRadians(120),
  minFov: number = CesiumMath.toRadians(5)
) => {
  const hasViewer = ctx.withWidget((w) => {
    cancelAnimation(w, ctx.AnimationMapRef.current);
  });
  if (!hasViewer) return;
  ctx.withCamera((camera) => {
    if (!(camera.frustum instanceof PerspectiveFrustum)) {
      console.debug("Camera frustum is not PerspectiveFrustum");
      return;
    }

    if (!camera.frustum.fov) return;

    const startFov = camera.frustum.fov;

    const fovChange = moveRateFactor * FOV_MOVERATE_FACTOR;

    const newFov = startFov * (zoomIn ? 1 + fovChange : 1 - fovChange);

    const targetFov = Math.max(Math.min(newFov, maxFov), minFov);

    cesiumAnimateFov(ctx, {
      startFov,
      targetFov,
      duration,
      easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
    });
  });
};

/**
 * @param ctx - Cesium context
 * @param zoomOptions - Options for the zoom animation.
 * @param zoomOptions.fovMode - The mode of the zoom animation. Default is "zoom".
 * @param zoomOptions.duration - The duration of the animation in milliseconds. Default is 0.5.
 * @param zoomOptions.moveRateFactor - The factor by which the camera's default zoom/moveRate increment be amplified by, default 1.
 */

export function useZoomControls(
  ctx: CesiumContextType,
  zoomOptions: Partial<ZoomOptions> = {}
) {
  const { duration, fovMode, moveRateFactor } = {
    ...defaultZoomOptions,
    ...zoomOptions,
  };

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      fovMode
        ? fovZoom(ctx, false, duration * 1000, moveRateFactor)
        : zoom(ctx, false, duration, moveRateFactor);
    },
    [ctx, duration, moveRateFactor, fovMode]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      fovMode
        ? fovZoom(ctx, true, duration * 1000, moveRateFactor)
        : zoom(ctx, true, duration, moveRateFactor);
    },
    [ctx, duration, moveRateFactor, fovMode]
  );

  return { handleZoomIn, handleZoomOut };
}
