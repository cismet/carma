import { Matrix4, Plane, Ray, Vector3, Vector4 } from "three";
import {
  degToRadNumeric,
  radToDegNumeric,
  type DevicePixels,
} from "@carma-units";
import {
  cartographicToEcef,
  ecefToCartographic,
  createLocalEcefFrame,
} from "@carma-geo/proj";
import type { ObliqueCameraCalibration } from "../types";
import { objectCoveragePixelRay } from "./object-coverage";
import {
  normalizeSeamlessCenterY,
  type SeamlessImagePoint,
} from "./seamless-image-center";

export type PhotoCenterRays = {
  eye: Vector3;
  axis: Ray | null;
  sensor: Ray | null;
  preferred: Ray | null;
  preferredUp: Ray | null;
  nadir: Ray | null;
  /** Photo-local pitch measured from nadir (0°) toward the horizon (90°). */
  axisPitchDeg: number | null;
  preferredPitchDeg: number | null;
};

/** Full-sensor bottom-up coordinates of a ray originating at the photo eye.
 * Project its direction to avoid subtracting large translated eye coordinates. */
export const photoCenterRayUv = (
  projection: Matrix4,
  ray: Ray | null
): SeamlessImagePoint | null => {
  if (!ray) return null;
  const projected = new Vector4(
    ray.direction.x,
    ray.direction.y,
    ray.direction.z,
    0
  ).applyMatrix4(projection);
  if (!(projected.w > 0) || !projected.toArray().every(Number.isFinite))
    return null;
  return { x: projected.x / projected.w, y: projected.y / projected.w };
};

/** Distinct calibrated centre rays in the shared scene frame. sceneToPhoto maps
 * into the photo-centred local ENU frame (Z up), not the optical camera basis. */
export const photoCenterRays = ({
  projection,
  sceneToPhoto,
  calibration,
  centerY,
}: {
  projection: Matrix4;
  sceneToPhoto: Matrix4;
  calibration: Pick<ObliqueCameraCalibration, "widthPx" | "heightPx">;
  centerY: number;
}): PhotoCenterRays => {
  const empty = (): PhotoCenterRays => ({
    eye: new Vector3(),
    axis: null,
    sensor: null,
    preferred: null,
    preferredUp: null,
    nadir: null,
    axisPitchDeg: null,
    preferredPitchDeg: null,
  });
  const determinant = sceneToPhoto.determinant();
  if (
    !sceneToPhoto.elements.every(Number.isFinite) ||
    !Number.isFinite(determinant) ||
    determinant === 0
  )
    return empty();
  const photoToScene = sceneToPhoto.clone().invert();
  const eye = new Vector3().applyMatrix4(photoToScene);
  if (!eye.toArray().every(Number.isFinite)) return empty();
  const pixelRay = (y: number, x = 0.5) =>
    objectCoveragePixelRay(
      projection,
      eye,
      {
        x: (calibration.widthPx * x) as DevicePixels,
        y: (calibration.heightPx * (1 - y)) as DevicePixels,
      },
      calibration
    );
  const sensor = pixelRay(0.5);
  // A valid photo projector is rank three; Matrix4 determinant is not a useful
  // validity check. The calibrated pixel-ray construction checks its ray planes.
  if (!sensor) return { ...empty(), eye };
  const directionRay = (direction: Vector3): Ray | null => {
    const length = direction.lengthSq();
    return Number.isFinite(length) && length > 0
      ? new Ray(eye.clone(), direction.normalize())
      : null;
  };
  const e = projection.elements;
  const axis = directionRay(new Vector3(e[3], e[7], e[11]));
  const principal = photoCenterRayUv(projection, axis);
  const preferredRay = (parameter: number): Ray | null => {
    if (!axis || !principal) return null;
    if (parameter === 0.5) return axis.clone();
    // Both limits lie in the image-vertical plane through the real calibrated
    // principal point, not the sensor midpoint. The 10% sensor padding remains
    // fixed; the slider interpolates angular pitch, not pixel coordinates.
    const limit = pixelRay(parameter < 0.5 ? 0.1 : 0.9, principal.x);
    if (!limit) return null;
    const dot = Math.max(-1, Math.min(1, axis.direction.dot(limit.direction)));
    const tangent = limit.direction
      .clone()
      .addScaledVector(axis.direction, -dot);
    const sine = tangent.length();
    if (sine < 1e-12) return dot > 0 ? axis.clone() : null;
    tangent.multiplyScalar(1 / sine);
    const angle = (Math.atan2(sine, dot) * Math.abs(parameter - 0.5)) / 0.4;
    return directionRay(
      axis.direction
        .clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(tangent, Math.sin(angle))
    );
  };
  const parameter = normalizeSeamlessCenterY(centerY);
  const preferred = preferredRay(parameter);
  const nadir = directionRay(
    new Vector3(0, 0, -1).transformDirection(photoToScene)
  );
  return {
    eye,
    axis,
    sensor,
    preferred,
    // Deliberately do not clamp the differential at the upper limit: up must
    // remain a positive direction there, rather than collapse onto preferred.
    preferredUp: preferredRay(parameter + 1 / calibration.heightPx),
    nadir,
    axisPitchDeg:
      axis && nadir
        ? radToDegNumeric(axis.direction.angleTo(nadir.direction))
        : null,
    preferredPitchDeg:
      preferred && nadir
        ? radToDegNumeric(preferred.direction.angleTo(nadir.direction))
        : null,
  };
};

/** Sensor midpoint and up-axis at the calibrated optical-centre depth. */
export const photoCentersAtOpticalDepth = (
  rays: PhotoCenterRays,
  axisPoint: Vector3
) => {
  if (!rays.axis) return { center: null, up: null };
  const plane = new Plane().setFromNormalAndCoplanarPoint(
    rays.axis.direction,
    axisPoint
  );
  return {
    center: rays.sensor?.intersectPlane(plane, new Vector3()) ?? null,
    up: rays.preferredUp?.intersectPlane(plane, new Vector3()) ?? null,
  };
};

/** Presentation heights are DHHN here. Physical catalogue ECEF must first pass
 * through the loader's GCG inverse; inserting ellipsoidal h would shift the DEM.
 * This mirrors the existing DEM's H-valued ECEF presentation, not EPSG:4978. */
export const presentationPointToScene = (
  point: { longitude: number; latitude: number; heightMeters: number },
  origin: readonly [number, number],
  sceneFromLocal: Matrix4
): Vector3 =>
  cartographicToEcef(
    degToRadNumeric(point.longitude),
    degToRadNumeric(point.latitude),
    point.heightMeters
  )
    .applyMatrix4(createLocalEcefFrame(origin[0], origin[1]).localFromEcef)
    .applyMatrix4(sceneFromLocal);

export const sceneToPresentationPoint = (
  point: Vector3,
  origin: readonly [number, number],
  sceneFromLocal: Matrix4
) => {
  const cartographic = ecefToCartographic(
    point
      .clone()
      .applyMatrix4(sceneFromLocal.clone().invert())
      .applyMatrix4(createLocalEcefFrame(origin[0], origin[1]).ecefFromLocal)
  );
  return {
    longitude: radToDegNumeric(cartographic.longitude),
    latitude: radToDegNumeric(cartographic.latitude),
    heightMeters: cartographic.altitude,
  };
};

/** A screen ray intersects a known photo plane; this never samples live depth. */
export const screenPointOnPhotoPlane = (
  sceneToClip: Matrix4,
  screen: { x: number; y: number },
  viewport: { width: number; height: number },
  normal: Vector3,
  anchor: Vector3
): Vector3 | null => {
  if (
    !(viewport.width > 0 && viewport.height > 0) ||
    !sceneToClip.determinant()
  )
    return null;
  const inverse = sceneToClip.clone().invert();
  const x = (screen.x / viewport.width) * 2 - 1,
    y = 1 - (screen.y / viewport.height) * 2;
  const near = new Vector3(x, y, -0.5).applyMatrix4(inverse);
  const direction = new Vector3(x, y, 0.5)
    .applyMatrix4(inverse)
    .sub(near)
    .normalize();
  if (
    ![
      ...near.toArray(),
      ...direction.toArray(),
      ...normal.toArray(),
      ...anchor.toArray(),
    ].every(Number.isFinite)
  )
    return null;
  return new Ray(near, direction).intersectPlane(
    new Plane().setFromNormalAndCoplanarPoint(normal, anchor),
    new Vector3()
  );
};
