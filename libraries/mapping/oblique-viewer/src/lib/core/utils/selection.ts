import { Matrix4, Sphere, Vector3 } from "three";
import { degToRadNumeric } from "@carma-units";
import { projectObjectCoverageSphere } from "./object-coverage";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../runtime/utils/image-projection";
import { clamp, shortestAngleDelta } from "@carma-commons/math";
import { getProj4Converter } from "@carma-geo/proj";
import type {
  NearestObliqueImageRecord,
  ObliqueDataset,
  ObliqueCameraCalibration,
  ObliqueGroundTarget,
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
  PointWithSector,
} from "../types";
import { getCameraCalibration } from "./calibration";
import { computePose } from "./exteriorOrientation";
import { wgs84ToDatasetXY, type DatasetConverter } from "./imageRecord";

const poseFor = (record: ObliqueImageRecord, dataset: ObliqueDataset) => {
  if (!record.pose) {
    const calibration = getCameraCalibration(dataset, record.cameraId);
    record.pose = computePose(
      record,
      [record.centerWGS84[0], record.centerWGS84[1]],
      calibration.upMapping,
      calibration.imageUpInCamera
    );
  }
  return record.pose;
};

const gridIntersection = (
  record: ObliqueImageRecord,
  direction: Vector3,
  convergence: number,
  heightMeters: number
): [number, number] | null => {
  if (direction.z >= -1e-6 || record.z <= heightMeters) return null;
  const length = (heightMeters - record.z) / direction.z;
  const gridDirection = direction
    .clone()
    .applyAxisAngle(new Vector3(0, 0, 1), convergence);
  return [
    record.x + gridDirection.x * length,
    record.y + gridDirection.y * length,
  ];
};

const sourcePixelRay = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset,
  pixelX: number,
  pixelY: number
): Vector3 => {
  const camera = getCameraCalibration(dataset, record.cameraId);
  const affine = camera.imageMmToPixelAffine;
  if (affine) {
    const [[a, b, cx], [d, e, cy]] = affine;
    const determinant = a * e - b * d;
    const offsetX = pixelX - cx;
    const offsetY = pixelY - cy;
    const mmX = (e * offsetX - b * offsetY) / determinant;
    const mmY = (-d * offsetX + a * offsetY) / determinant;
    return new Vector3(...record.m[0])
      .multiplyScalar(mmX / camera.focalLengthMm)
      .addScaledVector(new Vector3(...record.m[1]), mmY / camera.focalLengthMm)
      .sub(new Vector3(...record.m[2]));
  }
  const pose = poseFor(record, dataset);
  const direction = new Vector3(...pose.direction);
  const up = new Vector3(...pose.up);
  const right = new Vector3().crossVectors(direction, up).normalize();
  const focalPx =
    Math.max(camera.widthPx, camera.heightPx) / (2 * camera.halfFovTan);
  return direction
    .addScaledVector(right, (pixelX - camera.principalPointPx[0]) / focalPx)
    .addScaledVector(up, (camera.principalPointPx[1] - pixelY) / focalPx)
    .applyAxisAngle(new Vector3(0, 0, 1), pose.utmConvergenceRad);
};

/** Delivered image-centre ray meets a marked approximation plane, not surveyed terrain. */
export const estimateGroundCenter = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset,
  converter: DatasetConverter = getProj4Converter(dataset.crs, "EPSG:4326")
): PointWithSector => {
  const camera = getCameraCalibration(dataset, record.cameraId);
  const ray = sourcePixelRay(
    record,
    dataset,
    (camera.widthPx - 1) * 0.5,
    (camera.heightPx - 1) * 0.5
  );
  const xy = gridIntersection(
    record,
    ray,
    0,
    dataset.referenceGroundHeightMeters ?? 0
  ) ?? [record.x, record.y];
  const [longitude, latitude] = converter.forward(xy) as [number, number];
  return {
    id: record.id,
    x: xy[0],
    y: xy[1],
    longitude,
    latitude,
    cardinal: record.sector,
  };
};

/** Calibrated pixel-centre corner rays intersect the same approximation plane. */
export const estimateGroundFootprint = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset,
  converter: DatasetConverter = getProj4Converter(dataset.crs, "EPSG:4326")
): [number, number][] | undefined => {
  const camera = getCameraCalibration(dataset, record.cameraId);
  const corners: [number, number][] = [];
  for (const [pixelX, pixelY] of [
    [-0.5, -0.5],
    [camera.widthPx - 0.5, -0.5],
    [camera.widthPx - 0.5, camera.heightPx - 0.5],
    [-0.5, camera.heightPx - 0.5],
  ]) {
    const xy = gridIntersection(
      record,
      sourcePixelRay(record, dataset, pixelX, pixelY),
      0,
      dataset.referenceGroundHeightMeters ?? 0
    );
    if (!xy) return undefined;
    corners.push(converter.forward(xy) as [number, number]);
  }
  return [...corners, corners[0]];
};

const projectTargetPixel = (
  record: ObliqueImageRecord,
  camera: ObliqueCameraCalibration,
  gridRay: [number, number, number],
  horizontal: number,
  vertical: number
): [number, number] => {
  if (camera.imageMmToPixelAffine) {
    const [[a, b, cx], [d, e, cy]] = camera.imageMmToPixelAffine;
    const [x, y, z] = gridRay;
    const mmDepth = -(
      record.m[2][0] * x +
      record.m[2][1] * y +
      record.m[2][2] * z
    );
    const mmX =
      (camera.focalLengthMm *
        (record.m[0][0] * x + record.m[0][1] * y + record.m[0][2] * z)) /
      mmDepth;
    const mmY =
      (camera.focalLengthMm *
        (record.m[1][0] * x + record.m[1][1] * y + record.m[1][2] * z)) /
      mmDepth;
    return [a * mmX + b * mmY + cx, d * mmX + e * mmY + cy];
  }
  const focalPx =
    Math.max(camera.widthPx, camera.heightPx) / (2 * camera.halfFovTan);
  return [
    camera.principalPointPx[0] + horizontal * focalPx,
    camera.principalPointPx[1] - vertical * focalPx,
  ];
};

const containsPoint = (
  ring: readonly [number, number][],
  longitude: number,
  latitude: number
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
};

/** Enabled series compete geometrically; optional indexed candidates avoid a full-catalog scan. */
export const rankImagesForView = (
  data: ObliqueSelectionData,
  query: ObliqueViewQuery,
  candidates: Iterable<ObliqueImageRecord> = data.imageRecords.values()
): NearestObliqueImageRecord[] => {
  if (
    ![
      query.target.longitude,
      query.target.latitude,
      query.headingRad,
      query.pitchRad,
      query.target.heightMeters ?? 0,
    ].every(Number.isFinite)
  )
    return [];
  const enabled = query.enabledSeriesIds
    ? new Set(query.enabledSeriesIds)
    : null;
  const targets = new Map<string, [number, number]>();
  for (const [id, dataset] of data.datasets) {
    if (enabled && !enabled.has(id)) continue;
    targets.set(
      id,
      wgs84ToDatasetXY(
        getProj4Converter(dataset.crs, "EPSG:4326"),
        query.target.longitude,
        query.target.latitude
      )
    );
  }
  const sinPitch = Math.sin(query.pitchRad);
  const desired = [
    Math.sin(query.headingRad) * sinPitch,
    Math.cos(query.headingRad) * sinPitch,
    -Math.cos(query.pitchRad),
  ];
  const ranked: NearestObliqueImageRecord[] = [];
  const resolutions = new Map<
    string,
    { pixelsPerMeter: number; heading: number; preferred: boolean }
  >();
  const physicalFrame = new Matrix4();
  const targetSphere = new Sphere(new Vector3(), 0.0001);
  for (const record of candidates) {
    const dataset = data.datasets.get(record.seriesId);
    const xy = targets.get(record.seriesId);
    if (!dataset || !xy) continue;
    if (
      query.cameraView &&
      getCameraCalibration(dataset, record.cameraId).view !== query.cameraView
    )
      continue;
    const distanceToCamera = Math.hypot(xy[0] - record.x, xy[1] - record.y);
    const maxDistance = query.maxDistanceMeters ?? dataset.maxDistanceMeters;
    if (distanceToCamera > maxDistance) continue;
    const pose = poseFor(record, dataset);
    const [dx, dy, dz] = pose.direction;
    const [ux, uy, uz] = pose.up;
    // Grid-native target offset rotates to true ENU, once per candidate; pose is cached.
    const cos = Math.cos(pose.utmConvergenceRad);
    const sin = Math.sin(pose.utmConvergenceRad);
    const gridX = xy[0] - record.x;
    const gridY = xy[1] - record.y;
    const rayX = gridX * cos + gridY * sin;
    const rayY = -gridX * sin + gridY * cos;
    const normalizedHeight = query.perSeriesTargetHeightMeters?.get(dataset.id);
    const sameDatum =
      query.target.heightDatum === dataset.heightDatum &&
      dataset.heightDatum !== "unknown";
    // Unknown source heights use an explicitly approximate plane; known mismatches wait for conversion.
    if (
      query.target.heightMeters !== undefined &&
      dataset.heightDatum !== "unknown" &&
      !sameDatum &&
      normalizedHeight === undefined
    )
      continue;
    const groundHeight =
      normalizedHeight ??
      (sameDatum ? query.target.heightMeters : undefined) ??
      dataset.referenceGroundHeightMeters ??
      0;
    const rayZ = groundHeight - record.z;
    const depth = rayX * dx + rayY * dy + rayZ * dz;
    if (depth <= 0) continue;
    const rightX = dy * uz - dz * uy;
    const rightY = dz * ux - dx * uz;
    const rightZ = dx * uy - dy * ux;
    const horizontal = (rayX * rightX + rayY * rightY + rayZ * rightZ) / depth;
    const vertical = (rayX * ux + rayY * uy + rayZ * uz) / depth;
    const camera = getCameraCalibration(dataset, record.cameraId);
    const [pixelX, pixelY] = projectTargetPixel(
      record,
      camera,
      [gridX, gridY, rayZ],
      horizontal,
      vertical
    );
    const sensorCovers =
      pixelX >= -0.5 &&
      pixelX < camera.widthPx - 0.5 &&
      pixelY >= -0.5 &&
      pixelY < camera.heightPx - 0.5;
    const coversTarget =
      record.footprint && !record.footprintApproximate
        ? containsPoint(
            record.footprint,
            query.target.longitude,
            query.target.latitude
          )
        : sensorCovers;
    const outsideX =
      Math.max(0, -pixelX, pixelX - camera.widthPx) / camera.widthPx;
    const outsideY =
      Math.max(0, -pixelY, pixelY - camera.heightPx) / camera.heightPx;
    const angular =
      1 - clamp(dx * desired[0] + dy * desired[1] + dz * desired[2], -1, 1);
    const center = data.centers.get(record.id);
    if (!center) continue;
    const distanceOnGround = Math.hypot(xy[0] - center.x, xy[1] - center.y);
    const score =
      4 * angular +
      (coversTarget ? 0 : 4 + outsideX + outsideY) +
      distanceOnGround / Math.max(1, maxDistance);
    if (query.selectionStrategy === "best-resolution") {
      const heading =
        query.cameraView === "nadir"
          ? 0
          : Math.abs(
              shortestAngleDelta(
                query.headingRad,
                degToRadNumeric(pose.bearingDeg)
              )
            );
      targetSphere.center.set(0, groundHeight, 0);
      const coverage =
        query.target.heightMeters !== undefined &&
        dataset.heightDatum !== "unknown"
          ? projectObjectCoverageSphere(
              imageProjectionMatrix(
                record,
                camera,
                pose,
                sceneToPhotoEnu(
                  [query.target.longitude, query.target.latitude],
                  physicalFrame,
                  pose,
                  record.z
                )
              ),
              targetSphere,
              camera
            )
          : null;
      resolutions.set(record.id, {
        pixelsPerMeter: coverage?.pixelsPerMeter ?? 0,
        heading,
        preferred: !!coverage && coversTarget && heading <= Math.PI / 4,
      });
    }
    ranked.push({
      record,
      distanceOnGround,
      distanceToCamera,
      imageCenter: {
        x: center.x,
        y: center.y,
        longitude: center.longitude,
        latitude: center.latitude,
        cardinal: center.cardinal,
      },
      score,
      coversTarget,
      coverageApproximate:
        dataset.heightDatum === "unknown" ||
        query.target.heightMeters === undefined ||
        record.footprintApproximate,
    });
  }
  const hasNativeResolution = [...resolutions.values()].some(
    (entry) => entry.pixelsPerMeter > 0
  );
  ranked.sort((a, b) => {
    if (query.selectionStrategy === "best-resolution" && hasNativeResolution) {
      const first = resolutions.get(a.record.id)!;
      const second = resolutions.get(b.record.id)!;
      const eligibility = Number(second.preferred) - Number(first.preferred);
      if (eligibility) return eligibility;
      if (
        !first.preferred &&
        !second.preferred &&
        Math.abs(first.heading - second.heading) > 1e-8
      )
        return first.heading - second.heading;
      const density = second.pixelsPerMeter - first.pixelsPerMeter;
      if (density) return density;
    }
    return (
      (a.score ?? 0) - (b.score ?? 0) || a.record.id.localeCompare(b.record.id)
    );
  });
  return ranked.slice(0, query.numCandidates ?? 200);
};

/** A navigation arrow moves a ground target; the best matching image is then selected anew. */
export const panViewTarget = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset,
  target: ObliqueGroundTarget,
  movement: { right: number; forward: number },
  fraction = 0.12
): ObliqueGroundTarget => {
  const pose = poseFor(record, dataset);
  const converter = getProj4Converter(dataset.crs, "EPSG:4326");
  const xy = wgs84ToDatasetXY(converter, target.longitude, target.latitude);
  const forward = new Vector3(pose.direction[0], pose.direction[1], 0);
  if (forward.lengthSq() < 1e-12) forward.set(pose.up[0], pose.up[1], 0);
  if (forward.lengthSq() < 1e-12) forward.set(0, 1, 0);
  forward.normalize();
  const right = new Vector3(forward.y, -forward.x, 0);
  const targetHeight =
    target.heightDatum === dataset.heightDatum
      ? target.heightMeters
      : undefined;
  const height = Math.max(
    1,
    record.z - (targetHeight ?? dataset.referenceGroundHeightMeters ?? 0)
  );
  const scale =
    (2 *
      height *
      getCameraCalibration(dataset, record.cameraId).halfFovTan *
      fraction) /
    Math.max(0.1, Math.abs(pose.direction[2]));
  const offset = forward
    .multiplyScalar(movement.forward)
    .addScaledVector(right, movement.right)
    .multiplyScalar(scale)
    .applyAxisAngle(new Vector3(0, 0, 1), pose.utmConvergenceRad);
  const [longitude, latitude] = converter.forward([
    xy[0] + offset.x,
    xy[1] + offset.y,
  ]) as [number, number];
  return { ...target, longitude, latitude };
};
