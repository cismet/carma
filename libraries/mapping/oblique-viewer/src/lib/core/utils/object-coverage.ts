import { Matrix4, Ray, Sphere, Vector3, Vector4 } from "three";
import {
  degToRadNumeric,
  type CssPixels,
  type DevicePixels,
  type Ratio,
} from "@carma-units";

import type {
  CardinalDirection,
  ObliqueCameraCalibration,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../types";
import { getCameraCalibration } from "./calibration";
import {
  CARDINALS_CLOCKWISE,
  getCardinalDirectionFromHeading,
} from "./orientation";
import { getOrComputeObliquePose } from "./oblique-pose";
import { imageProjectionMatrix, sceneToPhotoEnu } from "./image-projection";

/** Heights use the same DHHN2016 convention as the aligned image camera. */
export type ObjectCoverageSphere = Readonly<{
  center: Readonly<{
    longitude: number;
    latitude: number;
    heightMeters: number;
  }>;
  radiusMeters: number;
}>;

export type ObjectCoverageCrop = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type ObjectCoverageImage = Readonly<{
  record: ObliqueImageRecord;
  dataset: ObliqueDataset;
  crop: ObjectCoverageCrop;
  /** Object-anchored east/up/south metres to calibrated image coordinates. */
  projection?: Matrix4;
  cameraAltitudeMeters?: number;
  /** Native pixels per metre along the least-resolved transverse direction. */
  pixelsPerMeter: number;
}>;

export type ObjectCoverageGroups = ReadonlyMap<
  CardinalDirection,
  readonly ObjectCoverageImage[]
>;

export type ObjectCoveragePixel = Readonly<{
  x: DevicePixels;
  y: DevicePixels;
}>;

/** Virtual native-sensor crop matches the panel and caps display magnification of delivered pixels. */
export const fitObjectCoverageCrop = (
  crop: ObjectCoverageCrop,
  viewport: Readonly<{ width: CssPixels; height: CssPixels }>,
  pixelRatio: Ratio,
  finestSourceDensity: Ratio = 1 as Ratio,
  maximumMagnification: Ratio = 3 as Ratio
): ObjectCoverageCrop => {
  if (
    ![
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      viewport.width,
      viewport.height,
      pixelRatio,
      finestSourceDensity,
      maximumMagnification,
    ].every(Number.isFinite) ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    pixelRatio <= 0 ||
    finestSourceDensity <= 0 ||
    maximumMagnification <= 0
  )
    throw new RangeError(
      "Object crop requires finite positive dimensions and pixel density"
    );
  const aspect = viewport.width / viewport.height;
  const height = Math.max(
    crop.height,
    crop.width / aspect,
    (viewport.height * pixelRatio) /
      (maximumMagnification * finestSourceDensity)
  );
  const width = height * aspect;
  const result = {
    x: crop.x + (crop.width - width) / 2,
    y: crop.y + (crop.height - height) / 2,
    width,
    height,
  };
  if (!Object.values(result).every(Number.isFinite))
    throw new RangeError("Object crop exceeds finite sensor coordinates");
  return result;
};

/** Native pixel coordinates, using the same delivered pixel-centre convention as coverage crops. */
export const projectObjectCoveragePoint = (
  projection: Matrix4,
  point: Vector3,
  calibration: Pick<ObliqueCameraCalibration, "widthPx" | "heightPx">
): ObjectCoveragePixel | null => {
  if (
    ![
      calibration.widthPx,
      calibration.heightPx,
      ...point.toArray(),
      ...projection.elements,
    ].every(Number.isFinite) ||
    calibration.widthPx <= 0 ||
    calibration.heightPx <= 0
  )
    return null;
  const projected = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    projection
  );
  if (!(projected.w > 0) || !projected.toArray().every(Number.isFinite))
    return null;
  const x = (projected.x / projected.w) * calibration.widthPx + 0.5;
  const y = (1 - projected.y / projected.w) * calibration.heightPx + 0.5;
  return Number.isFinite(x + y)
    ? { x: x as DevicePixels, y: y as DevicePixels }
    : null;
};

/** Calibrated native-pixel ray in the projector's physical scene frame, without any engine dependency. */
export const objectCoveragePixelRay = (
  projection: Matrix4,
  cameraOrigin: Vector3,
  pixel: ObjectCoveragePixel,
  calibration: Pick<ObliqueCameraCalibration, "widthPx" | "heightPx">
): Ray | null => {
  if (
    ![
      pixel.x,
      pixel.y,
      calibration.widthPx,
      calibration.heightPx,
      ...cameraOrigin.toArray(),
      ...projection.elements,
    ].every(Number.isFinite) ||
    calibration.widthPx <= 0 ||
    calibration.heightPx <= 0
  )
    return null;
  const e = projection.elements;
  const u = (pixel.x - 0.5) / calibration.widthPx;
  const v = 1 - (pixel.y - 0.5) / calibration.heightPx;
  const horizontal = new Vector3(
    e[0] - u * e[3],
    e[4] - u * e[7],
    e[8] - u * e[11]
  );
  const vertical = new Vector3(
    e[1] - v * e[3],
    e[5] - v * e[7],
    e[9] - v * e[11]
  );
  const direction = horizontal.cross(vertical);
  if (!(direction.lengthSq() > 0) || !Number.isFinite(direction.lengthSq()))
    return null;
  direction.normalize();
  const depthNormal = new Vector3(e[3], e[7], e[11]);
  if (direction.dot(depthNormal) < 0) direction.negate();
  if (!(direction.dot(depthNormal) > 0)) return null;
  return new Ray(cameraOrigin.clone(), direction);
};

const rowOf = (matrix: Matrix4, row: number): Vector4 => {
  const e = matrix.elements;
  return new Vector4(e[row], e[row + 4], e[row + 8], e[row + 12]);
};

const normalOf = (row: Vector4): Vector3 => new Vector3(row.x, row.y, row.z);

/** Exact tangent extrema of a linear homogeneous coordinate over a sphere. */
const projectedBounds = (
  numerator: Vector4,
  denominator: Vector4,
  center: Vector4,
  radius: number
): readonly [number, number] | null => {
  const a = normalOf(numerator);
  const c = normalOf(denominator);
  const u = numerator.dot(center);
  const w = denominator.dot(center);
  const radiusSquared = radius * radius;
  const quadratic = w * w - radiusSquared * c.lengthSq();
  const linear = 2 * (radiusSquared * a.dot(c) - u * w);
  const constant = u * u - radiusSquared * a.lengthSq();
  if (!(quadratic > 0)) return null;
  const discriminant = linear * linear - 4 * quadratic * constant;
  const tolerance =
    32 *
    Number.EPSILON *
    (linear * linear + Math.abs(4 * quadratic * constant));
  if (discriminant < -tolerance) return null;
  const root = Math.sqrt(Math.max(0, discriminant));
  const lower = (-linear - root) / (2 * quadratic);
  const upper = (-linear + root) / (2 * quadratic);
  return Number.isFinite(lower + upper) ? [lower, upper] : null;
};

/**
 * Full sensor containment, a sphere-tight native crop and native pixel density.
 * The matrix and sphere must share a physical metre frame. Partial frustum
 * intersection is deliberately insufficient, including the positive-depth side.
 */
export const projectObjectCoverageSphere = (
  projection: Matrix4,
  sphere: Sphere,
  calibration: Pick<ObliqueCameraCalibration, "widthPx" | "heightPx">
): Pick<ObjectCoverageImage, "crop" | "pixelsPerMeter"> | null => {
  const { widthPx: width, heightPx: height } = calibration;
  const { center, radius } = sphere;
  if (
    ![...center.toArray(), radius, width, height].every(Number.isFinite) ||
    !(radius > 0 && width > 0 && height > 0) ||
    !projection.elements.every(Number.isFinite)
  )
    return null;
  const point = new Vector4(center.x, center.y, center.z, 1);
  const u = rowOf(projection, 0);
  const v = rowOf(projection, 1);
  const w = rowOf(projection, 3);
  const depth = w.dot(point);
  const depthNormal = normalOf(w);
  if (!(depth > radius * depthNormal.length())) return null;

  // Delivered metadata references pixel centres; these are the sensor edges.
  const minU = -0.5 / width;
  const maxU = (width - 0.5) / width;
  const minV = 0.5 / height;
  const maxV = 1 + 0.5 / height;
  const planes = [
    u.clone().addScaledVector(w, -minU),
    w.clone().multiplyScalar(maxU).sub(u),
    v.clone().addScaledVector(w, -minV),
    w.clone().multiplyScalar(maxV).sub(v),
  ];
  if (
    planes.some((plane) => {
      const length = normalOf(plane).length();
      return !(length > 0) || plane.dot(point) / length < radius - 1e-8;
    })
  )
    return null;

  const horizontal = projectedBounds(u, w, point, radius);
  const vertical = projectedBounds(v, w, point, radius);
  if (!horizontal || !vertical) return null;
  const x = Math.max(0, Math.floor(horizontal[0] * width + 0.5));
  const y = Math.max(0, Math.floor((1 - vertical[1]) * height + 0.5));
  const right = Math.min(width, Math.ceil(horizontal[1] * width + 0.5));
  const bottom = Math.min(height, Math.ceil((1 - vertical[0]) * height + 0.5));
  if (!(right > x && bottom > y)) return null;

  // Singular values of the two calibrated image-coordinate derivatives.
  const horizontalDerivative = normalOf(u)
    .multiplyScalar(depth)
    .addScaledVector(depthNormal, -u.dot(point))
    .multiplyScalar(width / (depth * depth));
  const verticalDerivative = normalOf(v)
    .multiplyScalar(depth)
    .addScaledVector(depthNormal, -v.dot(point))
    .multiplyScalar(height / (depth * depth));
  const xx = horizontalDerivative.lengthSq();
  const yy = verticalDerivative.lengthSq();
  const xy = horizontalDerivative.dot(verticalDerivative);
  const minimumEigenvalue = (xx + yy - Math.hypot(xx - yy, 2 * xy)) / 2;
  const pixelsPerMeter = Math.sqrt(Math.max(0, minimumEigenvalue));
  if (!(pixelsPerMeter > 0) || !Number.isFinite(pixelsPerMeter)) return null;
  return {
    crop: { x, y, width: right - x, height: bottom - y },
    pixelsPerMeter,
  };
};

/**
 * Loaded enabled series compete without the browsing search's angular ranking
 * or candidate cap. Resolve camera heights with resolveCameraAltitude before
 * calling; an absent height cannot claim calibrated coverage.
 */
export const groupObjectCoverageImages = (
  data: ObliqueSelectionData,
  sphere: ObjectCoverageSphere,
  cameraAltitudes: ReadonlyMap<string, number>,
  candidates: Iterable<ObliqueImageRecord> = data.imageRecords.values()
): ObjectCoverageGroups => {
  const groups = new Map<CardinalDirection, ObjectCoverageImage[]>(
    CARDINALS_CLOCKWISE.map((direction) => [direction, []])
  );
  const { longitude, latitude, heightMeters } = sphere.center;
  if (
    ![longitude, latitude, heightMeters, sphere.radiusMeters].every(
      Number.isFinite
    ) ||
    sphere.radiusMeters <= 0
  )
    return groups;
  // A rigid physical tangent frame at the selected object keeps the radius
  // independent of the shared scene's Mercator scale and moving metric affine.
  const physicalSphere = new Sphere(
    new Vector3(0, heightMeters, 0),
    sphere.radiusMeters
  );
  const identity = new Matrix4();
  for (const record of candidates) {
    const dataset = data.datasets.get(record.seriesId);
    const altitude = cameraAltitudes.get(record.id);
    if (!dataset || altitude === undefined || !Number.isFinite(altitude))
      continue;
    const calibration = getCameraCalibration(dataset, record.cameraId);
    if (calibration.view === "nadir") continue;
    const pose = getOrComputeObliquePose(record, dataset);
    const projection = imageProjectionMatrix(
      record,
      calibration,
      pose,
      sceneToPhotoEnu([longitude, latitude], identity, pose, altitude)
    );
    const geometry = projectObjectCoverageSphere(
      projection,
      physicalSphere,
      calibration
    );
    if (!geometry) continue;
    const direction = getCardinalDirectionFromHeading(
      degToRadNumeric(pose.bearingDeg)
    );
    groups.get(direction)!.push({
      record,
      dataset,
      ...geometry,
      projection,
      cameraAltitudeMeters: altitude,
    });
  }
  for (const images of groups.values())
    images.sort(
      (a, b) =>
        b.pixelsPerMeter - a.pixelsPerMeter ||
        a.record.id.localeCompare(b.record.id)
    );
  return groups;
};
