import { Matrix4, Vector3 } from "three";
import { TWO_PI } from "@carma-units";
import { getCameraCalibration } from "./calibration";
import { sceneToPhotoEnu } from "./image-projection";
import { getOrComputeObliquePose } from "./oblique-pose";
import {
  projectObjectCoveragePoint,
  type ObjectCoverageImage,
  type ObjectCoveragePixel,
  type ObjectCoverageSphere,
} from "./object-coverage";

const OUTLINE_SEGMENTS = 48;

/** Sphere silhouette in native sensor pixels; connect the last point to the first.
 * `center` stays in the original reference sphere's east/up/south metre frame.
 * Only the rigid camera frame is inverted, never the rank-three image projector.
 */
export const projectObjectCoverageOutline = (
  image: ObjectCoverageImage,
  referenceSphere: ObjectCoverageSphere,
  center: Vector3,
  radiusMeters: number
): readonly ObjectCoveragePixel[] | null => {
  const projection = image.projection;
  if (
    !projection ||
    !(radiusMeters > 0) ||
    ![
      radiusMeters,
      image.cameraAltitudeMeters,
      referenceSphere.center.longitude,
      referenceSphere.center.latitude,
      referenceSphere.center.heightMeters,
      ...center.toArray(),
      ...projection.elements,
    ].every(Number.isFinite)
  )
    return null;

  try {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    // Legacy pose derivation caches on the record; keep this geometry helper pure.
    const pose = getOrComputeObliquePose({ ...image.record }, image.dataset);
    const frame = sceneToPhotoEnu(
      [referenceSphere.center.longitude, referenceSphere.center.latitude],
      new Matrix4(),
      pose,
      image.cameraAltitudeMeters!
    );
    if (!frame.elements.every(Number.isFinite) || !frame.determinant())
      return null;
    const eye = new Vector3().applyMatrix4(frame.invert());
    const axis = eye.sub(center);
    const distanceSquared = axis.lengthSq();
    const radiusSquared = radiusMeters * radiusMeters;
    if (
      !Number.isFinite(distanceSquared + radiusSquared) ||
      !(distanceSquared > radiusSquared)
    )
      return null;

    const ringCenter = center
      .clone()
      .addScaledVector(axis, radiusSquared / distanceSquared);
    const ringRadius =
      radiusMeters * Math.sqrt(1 - radiusSquared / distanceSquared);
    axis.normalize();
    const right = new Vector3(
      Math.abs(axis.y) > 0.9 ? 1 : 0,
      Math.abs(axis.y) > 0.9 ? 0 : 1,
      0
    )
      .cross(axis)
      .normalize();
    const up = axis.clone().cross(right);

    // Bound homogeneous depth continuously, including between polygon vertices.
    const e = projection.elements;
    const depthAxis = new Vector3(e[3], e[7], e[11]);
    const depthCenter = depthAxis.dot(ringCenter) + e[15];
    const depthRadius =
      ringRadius * Math.hypot(depthAxis.dot(right), depthAxis.dot(up));
    if (
      !Number.isFinite(depthCenter + depthRadius) ||
      !(depthCenter > depthRadius)
    )
      return null;

    const outline: ObjectCoveragePixel[] = [];
    const point = new Vector3();
    for (let index = 0; index < OUTLINE_SEGMENTS; index += 1) {
      const angle = (index / OUTLINE_SEGMENTS) * TWO_PI;
      point
        .copy(ringCenter)
        .addScaledVector(right, Math.cos(angle) * ringRadius)
        .addScaledVector(up, Math.sin(angle) * ringRadius);
      const pixel = projectObjectCoveragePoint(projection, point, calibration);
      if (!pixel) return null;
      outline.push(pixel);
    }
    return outline;
  } catch {
    return null;
  }
};
