import { useCallback, useMemo } from "react";

import { Viewer, Cartesian2, Cartesian3, EasingFunction, Ray } from "cesium";
import {
  cancelViewerAnimation,
  type ViewerAnimationMap,
} from "../utils/viewerAnimationMap";

type ZoomOptions = {
  duration: number;
  minDistance: number;
  moveRateFactor: number;
};

const defaultZoomOptions: ZoomOptions = {
  duration: 0.5,
  minDistance: 100,
  moveRateFactor: 1,
};

const zoom = (
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  isZoomOut = false,
  { duration, minDistance, moveRateFactor }: ZoomOptions
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

  const isAnimating =
    (viewer.scene as unknown as { tweens: [] }).tweens.length > 0;

  if (isAnimating) {
    camera.completeFlight();
    console.debug("completing previous zoom or other flyTo animation");
    wasCancelled = true;
  }

  const screenCenter = new Cartesian2(
    scene.canvas.clientWidth / 2,
    scene.canvas.clientHeight / 2
  );
  const pickRay = camera.getPickRay(screenCenter);

  const pickPosition = pickRay && scene.globe.pick(pickRay, scene);
  if (!pickPosition) return;

  const cameraPosition = camera.position;
  const distance = Cartesian3.distance(cameraPosition, pickPosition);

  const maxDistance = scene.screenSpaceCameraController.maximumZoomDistance;
  if (maxDistance === undefined || maxDistance === Number.POSITIVE_INFINITY) {
    console.warn(
      "Cesium maximumZoomDistance is undefined or infinite, zooming may not work as expected, set maximumZoomDistance in cesium config for ScreenSpaceCameraController"
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

/**
 * @param viewerRef - reference to the Cesium Viewer component
 * @param moveRateFactor - The factor by which the camera's default zoom/moveRate increment be amplified by, default 1.
 */

export function useZoomControls(
  viewerRef: React.MutableRefObject<Viewer | null>,
  viewerAnimationMapRef: React.MutableRefObject<ViewerAnimationMap | null>,
  zoomOptions: Partial<ZoomOptions> = {}
) {
  const viewer = viewerRef.current;
  const viewerAnimationMap = viewerAnimationMapRef.current;
  const opts = useMemo(
    () => ({ ...defaultZoomOptions, ...zoomOptions }),
    [zoomOptions]
  );

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      if (!viewer || !viewerAnimationMap) return;
      event.preventDefault();
      zoom(viewer, viewerAnimationMap, false, opts);
    },
    [viewer, viewerAnimationMap, opts]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      if (!viewer || !viewerAnimationMap) return;
      event.preventDefault();
      zoom(viewer, viewerAnimationMap, true, opts);
    },
    [viewer, viewerAnimationMap, opts]
  );

  return { handleZoomIn, handleZoomOut };
}
