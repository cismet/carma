import { Matrix4, type Vector3 } from "three";
import type { CardinalDirection } from "../types";
import { getCameraCalibration } from "./calibration";
import {
  projectObjectCoveragePoint,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "./object-coverage";
import { objectCoverageViewPoint } from "./object-coverage-navigation";
import { getOrComputeObliquePose } from "./oblique-pose";
import { presentationPointToScene } from "./photo-center-rays";

export type ObjectCoverageArrow = "up" | "down" | "left" | "right";

const centerOf = (
  image: ObjectCoverageImage,
  sphere: ObjectCoverageSphere
): Vector3 | null => {
  const center = image.record.catalogCenter;
  if (center) {
    if (
      ![center.longitude, center.latitude, center.heightMeters].every(
        Number.isFinite
      ) ||
      Math.abs(center.latitude) > 90
    )
      return null;
    const point = presentationPointToScene(
      center,
      [sphere.center.longitude, sphere.center.latitude],
      new Matrix4()
    );
    return point.toArray().every(Number.isFinite) ? point : null;
  }
  try {
    const calibration = getCameraCalibration(
      image.dataset,
      image.record.cameraId
    );
    return objectCoverageViewPoint(
      image,
      sphere,
      {
        x: calibration.principalPointPx[0] + 0.5,
        y: calibration.principalPointPx[1] + 0.5,
      },
      sphere.center.heightMeters
    );
  } catch {
    return null;
  }
};

/** Candidates already belong to one heading and cover the entire query sphere.
 * Arrow sectors use the active image's delivered pixels; distance uses physical
 * catalogue centres, so alternating strips need no camera-id or resolution rule. */
export const findObjectCoverageNeighbors = (
  active: ObjectCoverageImage,
  images: readonly ObjectCoverageImage[],
  sphere: ObjectCoverageSphere
): Partial<Record<ObjectCoverageArrow, ObjectCoverageImage>> => {
  const neighbors: Partial<Record<ObjectCoverageArrow, ObjectCoverageImage>> =
    {};
  if (
    !active.projection ||
    ![
      sphere.center.longitude,
      sphere.center.latitude,
      sphere.center.heightMeters,
      sphere.radiusMeters,
    ].every(Number.isFinite) ||
    Math.abs(sphere.center.latitude) > 90 ||
    sphere.radiusMeters <= 0
  )
    return neighbors;
  const center = centerOf(active, sphere);
  if (!center) return neighbors;
  try {
    const calibration = getCameraCalibration(
      active.dataset,
      active.record.cameraId
    );
    const pixel = projectObjectCoveragePoint(
      active.projection,
      center,
      calibration
    );
    if (!pixel) return neighbors;
    const distances: Partial<Record<ObjectCoverageArrow, number>> = {};
    for (const candidate of images) {
      if (
        candidate.record.id === active.record.id ||
        candidate.record.seriesId !== active.record.seriesId
      )
        continue;
      const point = centerOf(candidate, sphere);
      if (!point) continue;
      const distance = center.distanceToSquared(point);
      if (!(distance > 1e-12) || !Number.isFinite(distance)) continue;
      const projected = projectObjectCoveragePoint(
        active.projection,
        point,
        calibration
      );
      if (!projected) continue;
      const dx = projected.x - pixel.x,
        dy = projected.y - pixel.y;
      if (
        !Number.isFinite(dx + dy) ||
        Math.max(Math.abs(dx), Math.abs(dy)) <= 1e-9
      )
        continue;
      const arrow: ObjectCoverageArrow =
        Math.abs(dx) >= Math.abs(dy)
          ? dx < 0
            ? "left"
            : "right"
          : dy < 0
          ? "up"
          : "down";
      const previous = neighbors[arrow],
        previousDistance = distances[arrow];
      if (
        previousDistance === undefined ||
        distance < previousDistance ||
        (distance === previousDistance &&
          previous &&
          candidate.record.id < previous.record.id)
      ) {
        neighbors[arrow] = candidate;
        distances[arrow] = distance;
      }
    }
    return neighbors;
  } catch {
    return neighbors;
  }
};

const GERMAN_COMPASS_WINDS = [
  "N",
  "NNO",
  "NO",
  "ONO",
  "O",
  "OSO",
  "SO",
  "SSO",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

/** Actual capture heading and its signed deviation from the panel's cardinal. */
export const objectCoverageHeadingLabel = (
  image: ObjectCoverageImage,
  quadrant: CardinalDirection
): string => {
  try {
    const bearing = getOrComputeObliquePose(
      image.record,
      image.dataset
    ).bearingDeg;
    if (
      !Number.isFinite(bearing) ||
      !Number.isInteger(quadrant) ||
      quadrant < 0 ||
      quadrant > 3
    )
      return "—";
    const heading = ((bearing % 360) + 360) % 360;
    const wind = GERMAN_COMPASS_WINDS[Math.round(heading / 22.5) % 16];
    const delta = ((heading - quadrant * 90 + 540) % 360) - 180;
    const degrees = Math.round(Math.abs(delta));
    const signed = degrees === 0 ? "0" : `${delta < 0 ? "−" : "+"}${degrees}`;
    return `${wind} ${signed}°`;
  } catch {
    return "—";
  }
};
