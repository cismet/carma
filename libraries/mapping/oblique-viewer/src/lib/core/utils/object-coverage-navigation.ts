import { Matrix4, Vector3 } from "three";
import type { DevicePixels } from "@carma-units";
import { getCameraCalibration } from "./calibration";
import { sceneToPhotoEnu } from "./image-projection";
import { getOrComputeObliquePose } from "./oblique-pose";
import {
  objectCoveragePixelRay,
  projectObjectCoveragePoint,
  type ObjectCoverageCrop,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "./object-coverage";

export type ObjectCoverageView = Readonly<{ focus: Vector3; zoom: number }>;
type Pixel = Readonly<{ x: number; y: number }>;

const finitePoint = (point: Vector3) => point.toArray().every(Number.isFinite);
const validSphere = (sphere: ObjectCoverageSphere) =>
  [
    sphere.center.longitude,
    sphere.center.latitude,
    sphere.center.heightMeters,
    sphere.radiusMeters,
  ].every(Number.isFinite) && sphere.radiusMeters > 0;
const validCrop = (crop: ObjectCoverageCrop) =>
  [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
  crop.width > 0 &&
  crop.height > 0;
const validView = (view: ObjectCoverageView) =>
  finitePoint(view.focus) &&
  Number.isFinite(view.zoom) &&
  view.zoom >= 1 &&
  view.zoom <= 16;
const defaultFocus = (sphere: ObjectCoverageSphere) =>
  new Vector3(0, sphere.center.heightMeters, 0);

/** A shared metric focus, independent of each panel's calibrated camera. */
export const createObjectCoverageView = (
  sphere: ObjectCoverageSphere
): ObjectCoverageView => {
  if (!validSphere(sphere))
    throw new RangeError(
      "Object view requires a finite sphere with positive radius"
    );
  return { focus: defaultFocus(sphere), zoom: 1 };
};

/** Native sensor crop from the initially fitted crop; interactive zoom may magnify pixels. */
export const objectCoverageViewCrop = (
  image: ObjectCoverageImage,
  sphere: ObjectCoverageSphere,
  baseCrop: ObjectCoverageCrop,
  view: ObjectCoverageView
): ObjectCoverageCrop | null => {
  if (
    !validSphere(sphere) ||
    !validCrop(baseCrop) ||
    !validView(view) ||
    !image.projection
  )
    return null;
  try {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    const initial = projectObjectCoveragePoint(
      image.projection,
      defaultFocus(sphere),
      calibration
    );
    const focus = projectObjectCoveragePoint(
      image.projection,
      view.focus,
      calibration
    );
    if (!initial || !focus) return null;
    const width = baseCrop.width / view.zoom,
      height = baseCrop.height / view.zoom;
    const crop = {
      x: baseCrop.x + (baseCrop.width - width) / 2 + (focus.x - initial.x),
      y: baseCrop.y + (baseCrop.height - height) / 2 + (focus.y - initial.y),
      width,
      height,
    };
    return validCrop(crop) ? crop : null;
  } catch {
    return null;
  }
};

/** Intersect a native sensor pixel's forward ray with the shared horizontal focus plane.
 * The supplied projector already includes source mounting, roll and principal offsets.
 * Its rank-three sensor matrix is never inverted; only the rigid camera frame is. */
export const objectCoverageViewPoint = (
  image: ObjectCoverageImage,
  sphere: ObjectCoverageSphere,
  pixel: Pixel,
  focusHeight: number
): Vector3 | null => {
  if (
    !validSphere(sphere) ||
    !image.projection ||
    ![pixel.x, pixel.y, focusHeight, image.cameraAltitudeMeters].every(
      Number.isFinite
    )
  )
    return null;
  try {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    const pose = getOrComputeObliquePose(image.record, image.dataset);
    const frame = sceneToPhotoEnu(
      [sphere.center.longitude, sphere.center.latitude],
      new Matrix4(),
      pose,
      image.cameraAltitudeMeters!
    );
    if (!frame.elements.every(Number.isFinite) || !frame.determinant())
      return null;
    const eye = new Vector3().applyMatrix4(frame.invert());
    const ray = objectCoveragePixelRay(
      image.projection,
      eye,
      { x: pixel.x as DevicePixels, y: pixel.y as DevicePixels },
      calibration
    );
    if (!ray || Math.abs(ray.direction.y) <= 1e-12) return null;
    const distance = (focusHeight - ray.origin.y) / ray.direction.y;
    if (!(distance > 0) || !Number.isFinite(distance)) return null;
    const point = ray.at(distance, new Vector3());
    point.y = focusHeight;
    return finitePoint(point) ? point : null;
  } catch {
    return null;
  }
};

const boundedFocus = (
  sphere: ObjectCoverageSphere,
  focus: Vector3
): Vector3 | null => {
  if (!finitePoint(focus)) return null;
  const dy = focus.y - sphere.center.heightMeters;
  if (Math.abs(dy) > sphere.radiusMeters) return null;
  const radius = Math.sqrt(
    Math.max(0, sphere.radiusMeters * sphere.radiusMeters - dy * dy)
  );
  const distance = Math.hypot(focus.x, focus.z);
  if (!Number.isFinite(radius) || !Number.isFinite(distance)) return null;
  if (distance > radius) {
    focus.x *= radius / distance;
    focus.z *= radius / distance;
  }
  return focus;
};
const nextView = (
  sphere: ObjectCoverageSphere,
  view: ObjectCoverageView,
  focus: Vector3,
  zoom: number
) => {
  const bounded = boundedFocus(sphere, focus);
  if (!bounded) return null;
  return view.focus.distanceToSquared(bounded) <= 1e-18 && view.zoom === zoom
    ? view
    : { focus: bounded, zoom };
};

/** from/to are native sensor pixels mapped through the current displayed crop. */
export const panObjectCoverageView = (
  image: ObjectCoverageImage,
  sphere: ObjectCoverageSphere,
  crop: ObjectCoverageCrop,
  view: ObjectCoverageView,
  fromPx: Pixel,
  toPx: Pixel
): ObjectCoverageView | null => {
  if (
    !validSphere(sphere) ||
    !validCrop(crop) ||
    !validView(view) ||
    !image.projection ||
    ![fromPx.x, fromPx.y, toPx.x, toPx.y].every(Number.isFinite)
  )
    return null;
  if (fromPx.x === toPx.x && fromPx.y === toPx.y) return view;
  try {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    const focusPixel = projectObjectCoveragePoint(
      image.projection,
      view.focus,
      calibration
    );
    if (!focusPixel) return null;
    // Translate in sensor space before intersecting the projective focus plane.
    const focus = objectCoverageViewPoint(
      image,
      sphere,
      {
        x: focusPixel.x + fromPx.x - toPx.x,
        y: focusPixel.y + fromPx.y - toPx.y,
      },
      view.focus.y
    );
    return focus ? nextView(sphere, view, focus, view.zoom) : null;
  } catch {
    return null;
  }
};

/** Keep the pointer's native pixel at its viewport fraction while scaling the crop.
 * The selected sphere limits focus movement; clipping at that limit takes priority
 * over pointer anchoring. The initial crop may be fitted to a magnification cap,
 * but interactive zoom keeps this crop scale; fetches need not exceed native pixels. */
export const zoomObjectCoverageView = (
  image: ObjectCoverageImage,
  sphere: ObjectCoverageSphere,
  crop: ObjectCoverageCrop,
  view: ObjectCoverageView,
  pixel: Pixel,
  factor: number
): ObjectCoverageView | null => {
  if (
    !validSphere(sphere) ||
    !validCrop(crop) ||
    !validView(view) ||
    !image.projection ||
    ![pixel.x, pixel.y, factor].every(Number.isFinite) ||
    !(factor > 0)
  )
    return null;
  const zoom = Math.max(1, Math.min(16, view.zoom * factor));
  if (zoom === view.zoom) return view;
  try {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    const focusPixel = projectObjectCoveragePoint(
      image.projection,
      view.focus,
      calibration
    );
    if (!focusPixel) return null;
    const ratio = view.zoom / zoom;
    const focus = objectCoverageViewPoint(
      image,
      sphere,
      {
        x: focusPixel.x + (pixel.x - (crop.x + crop.width / 2)) * (1 - ratio),
        y: focusPixel.y + (pixel.y - (crop.y + crop.height / 2)) * (1 - ratio),
      },
      view.focus.y
    );
    return focus ? nextView(sphere, view, focus, zoom) : null;
  } catch {
    return null;
  }
};
