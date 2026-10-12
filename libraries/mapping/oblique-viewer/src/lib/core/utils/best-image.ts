import { scoreCalibratedCameraAxis } from "@carma-commons/math";
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
  const cosine = scoreCalibratedCameraAxis(
    {
      sceneToImage: geometry.projection,
      eye: geometry.eye,
      direction: geometry.preferredDirection,
    },
    target
  );
  if (cosine === null) return null;
  const projected = new Vector4(target.x, target.y, target.z, 1).applyMatrix4(
    geometry.projection
  );
  return {
    deviation: (1 - cosine) as Ratio,
    imagePoint: { x: projected.x / projected.w, y: projected.y / projected.w },
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
