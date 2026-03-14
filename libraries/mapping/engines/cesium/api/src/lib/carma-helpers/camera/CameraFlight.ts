import {
  BoundingSphere,
  Camera,
  Cartesian3,
  HeadingPitchRange,
} from "../../cesium";

// Reusable scratch objects for flyToTarget.
const scratchBoundingSphere = new BoundingSphere();
const scratchHeadingPitchRange = new HeadingPitchRange();

/**
 * Fly camera to target position with HeadingPitchRange orientation.
 */
export const flyToTarget = (
  camera: Camera,
  target: Cartesian3,
  hpr: { heading: number; pitch: number; range: number },
  duration?: number
): void => {
  scratchBoundingSphere.center = target;
  scratchBoundingSphere.radius = 0;

  scratchHeadingPitchRange.heading = hpr.heading;
  scratchHeadingPitchRange.pitch = hpr.pitch;
  scratchHeadingPitchRange.range = hpr.range;

  const options: {
    offset: HeadingPitchRange;
    duration?: number;
  } = {
    offset: scratchHeadingPitchRange,
  };

  if (duration !== undefined) {
    options.duration = duration;
  }

  camera.flyToBoundingSphere(scratchBoundingSphere, options);
};
