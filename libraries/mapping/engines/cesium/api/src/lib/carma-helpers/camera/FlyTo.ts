import {
  BoundingSphere,
  Cartesian3,
  HeadingPitchRange,
  type Camera,
} from "../../cesium";

export type FlyToOptions = {
  paddingFactor?: number;
  minRange?: number;
  heading?: number;
  pitch?: number;
};

export const flyToBoundingSphereExtent = (
  camera: Camera | null | undefined,
  sphere: BoundingSphere,
  options: FlyToOptions = {}
): void => {
  if (!camera) return;
  const {
    paddingFactor = 1.2,
    minRange = 0,
    heading = camera.heading,
    pitch = camera.pitch,
  } = options;

  const frustum = camera.frustum as { fov?: number };
  const fov = frustum?.fov;
  const rangeFromFov =
    typeof fov === "number" && fov > 0
      ? sphere.radius / Math.sin(fov * 0.5)
      : sphere.radius * 2;
  const range = Math.max(rangeFromFov, minRange) * paddingFactor;

  camera.flyToBoundingSphere(sphere, {
    offset: new HeadingPitchRange(heading, pitch, range),
  });
};

export const flyToPoints = (
  camera: Camera | null | undefined,
  points: readonly Cartesian3[],
  options: FlyToOptions = {}
): void => {
  if (!camera || points.length === 0) return;
  const sphere = BoundingSphere.fromPoints([...points]);
  flyToBoundingSphereExtent(camera, sphere, options);
};
