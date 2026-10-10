import type { Ratio } from "@carma-units";
import { Matrix4, Vector3, Vector4 } from "three";
import type { ObliqueImageRecord } from "../types";

export type BestImageGeometry = Readonly<{
  /** Full-sensor bottom-left UV projection, with positive camera depth in w. */
  projection: Matrix4;
  eye: Vector3;
  preferredDirection: Vector3;
  centerY?: number;
}>;

export type BestImageRank = Readonly<{
  record: ObliqueImageRecord;
  /** 1 - cosine angular similarity. Lower is a closer optical-axis match. */
  deviation: Ratio;
  imagePoint: Readonly<{ x: number; y: number }>;
  centerY?: number;
}>;

export type BestImageGeometryScore = Readonly<{
  deviation: Ratio;
  imagePoint: Readonly<{ x: number; y: number }>;
  centerY?: number;
}>;

/** Score geometry independently of record metadata for every ranking mode. */
export const scoreBestImageGeometry = (
  geometry: BestImageGeometry,
  target: Vector3
): BestImageGeometryScore | null => {
  if (
    !target.toArray().every(Number.isFinite) ||
    !geometry.eye.toArray().every(Number.isFinite) ||
    !geometry.preferredDirection.toArray().every(Number.isFinite) ||
    !geometry.projection.elements.every(Number.isFinite)
  )
    return null;
  const direction = target.clone().sub(geometry.eye);
  const directionLengthSq = direction.lengthSq();
  const preferredLengthSq = geometry.preferredDirection.lengthSq();
  if (
    !(directionLengthSq > 0) ||
    !(preferredLengthSq > 0) ||
    !Number.isFinite(directionLengthSq) ||
    !Number.isFinite(preferredLengthSq)
  )
    return null;

  const projected = new Vector4(target.x, target.y, target.z, 1).applyMatrix4(
    geometry.projection
  );
  if (!projected.toArray().every(Number.isFinite) || !(projected.w > 0))
    return null;
  const imagePoint = {
    x: projected.x / projected.w,
    y: projected.y / projected.w,
  };
  if (
    !Number.isFinite(imagePoint.x) ||
    !Number.isFinite(imagePoint.y) ||
    imagePoint.x < 0 ||
    imagePoint.x > 1 ||
    imagePoint.y < 0 ||
    imagePoint.y > 1
  )
    return null;

  const cosine = Math.max(
    -1,
    Math.min(
      1,
      direction.dot(geometry.preferredDirection) /
        Math.sqrt(directionLengthSq * preferredLengthSq)
    )
  );
  if (!Number.isFinite(cosine)) return null;
  return {
    deviation: (1 - cosine) as Ratio,
    imagePoint,
    ...(geometry.centerY === undefined ? {} : { centerY: geometry.centerY }),
  };
};

/** Record-aware adapter retained for picker consumers. */
export const scoreBestImage = (
  record: ObliqueImageRecord,
  geometry: BestImageGeometry,
  target: Vector3
): BestImageRank | null => {
  const score = scoreBestImageGeometry(geometry, target);
  return score ? { record, ...score } : null;
};

/** Score all candidates and order by optical-axis deviation with deterministic ties. */
export const rankBestImages = (
  candidates: readonly Readonly<{
    record: ObliqueImageRecord;
    geometry: BestImageGeometry;
  }>[],
  target: Vector3,
  activeImageId?: string | null
): BestImageRank[] => {
  const ranks = candidates.flatMap(({ record, geometry }) => {
    const rank = scoreBestImage(record, geometry, target);
    return rank ? [rank] : [];
  });
  ranks.sort((a, b) => {
    const delta = a.deviation - b.deviation;
    if (delta !== 0) return delta;
    if (activeImageId) {
      const aActive = a.record.id === activeImageId;
      const bActive = b.record.id === activeImageId;
      if (aActive !== bActive) return aActive ? -1 : 1;
    }
    return a.record.id.localeCompare(b.record.id);
  });
  return ranks;
};
