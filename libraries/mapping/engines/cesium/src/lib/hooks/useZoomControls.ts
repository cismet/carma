import { useCallback } from "react";

import {
  type Viewer,
  Cartesian2,
  Cartesian3,
  EasingFunction,
  Math as CesiumMath,
  Ray,
  PerspectiveFrustum,
} from "cesium";
import {
  cancelViewerAnimation,
  type ViewerAnimationMap,
} from "../utils/viewerAnimationMap";
import { cesiumAnimateFov } from "../utils/cesiumAnimateFov";
import { cesiumSceneHasTweens } from "../utils/cesiumAnimations";

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
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  isZoomOut = false,
  duration: number,
  moveRateFactor: number
) => {
  const scene = viewer.scene;
  const camera = viewer.camera;
  let wasCancelled = false;

  if (viewerAnimationMap.get(viewer)) {
    cancelViewerAnimation(viewer, viewerAnimationMap);
    wasCancelled = true;
  }

  // undocumented Cesium feature
  // TODO: replace with a public API when one is available to check for ongoing flyTo animations

  if (cesiumSceneHasTweens(viewer)) {
    camera.completeFlight();
    console.debug("completing previous zoom or other flyTo animation");
    wasCancelled = true;
  }

  const screenCenter = new Cartesian2(
    scene.canvas.clientWidth / 2,
    scene.canvas.clientHeight / 2
  );

  const scenePickPosition = scene.pickPosition(screenCenter);

  const pickRay = camera.getPickRay(screenCenter);

  const cameraPosition = camera.position;

  if (!pickRay) return;

  const globePickPosition = pickRay && scene.globe.pick(pickRay, scene);

  let globeDistance: number | undefined = undefined;
  if (globePickPosition) {
    globeDistance = Cartesian3.distance(cameraPosition, globePickPosition);
  }

  const sceneDistance =
    scenePickPosition && Cartesian3.distance(cameraPosition, scenePickPosition);

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
  return;
};

const fovZoom = (
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  zoomIn: boolean,
  duration: number,
  moveRateFactor: number,
  maxFov: number = CesiumMath.toRadians(120),
  minFov: number = CesiumMath.toRadians(5)
) => {
  if (viewerAnimationMap.get(viewer)) {
    cancelViewerAnimation(viewer, viewerAnimationMap);
  }
  if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
    console.debug("Camera frustum is not PerspectiveFrustum");
    return;
  }

  if (!viewer.camera.frustum.fov) return;

  const startFov = viewer.camera.frustum.fov;

  const fovChange = moveRateFactor * FOV_MOVERATE_FACTOR;

  const newFov = startFov * (zoomIn ? 1 + fovChange : 1 - fovChange);

  const targetFov = Math.max(Math.min(newFov, maxFov), minFov);

  cesiumAnimateFov({
    viewer,
    viewerAnimationMap,
    startFov,
    targetFov,
    duration,
    easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
  });
};

/**
 * @param viewerRef - reference to the Cesium Viewer component
 * @param moveRateFactor - The factor by which the camera's default zoom/moveRate increment be amplified by, default 1.
 * @param zoomOptions - Options for the zoom animation.
 * @param zoomOptions.fovMode - The mode of the zoom animation. Default is "zoom".
 * @param zoomOptions.duration - The duration of the animation in milliseconds. Default is 0.5.
 * @param zoomOptions.moveRateFactor - The factor by which the camera's default zoom/moveRate increment be amplified by, default 1.
 */

export function useZoomControls(
  viewerRef: React.MutableRefObject<Viewer | null>,
  viewerAnimationMapRef: React.MutableRefObject<ViewerAnimationMap | null>,
  zoomOptions: Partial<ZoomOptions> = {}
) {
  const viewer = viewerRef.current;
  const viewerAnimationMap = viewerAnimationMapRef.current;
  const { duration, fovMode, moveRateFactor } = {
    ...defaultZoomOptions,
    ...zoomOptions,
  };

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      if (!viewer || !viewerAnimationMap) return;
      event.preventDefault();
      fovMode
        ? fovZoom(
            viewer,
            viewerAnimationMap,
            false,
            duration * 1000,
            moveRateFactor
          )
        : zoom(viewer, viewerAnimationMap, false, duration, moveRateFactor);
    },
    [viewer, viewerAnimationMap, duration, moveRateFactor, fovMode]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      if (!viewer || !viewerAnimationMap) return;
      event.preventDefault();
      fovMode
        ? fovZoom(
            viewer,
            viewerAnimationMap,
            true,
            duration * 1000,
            moveRateFactor
          )
        : zoom(viewer, viewerAnimationMap, true, duration, moveRateFactor);
    },
    [viewer, viewerAnimationMap, duration, moveRateFactor, fovMode]
  );

  return { handleZoomIn, handleZoomOut };
}
