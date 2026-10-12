import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";
import {
  POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS,
  type PointQueryDiscOriginJump,
  type PointQueryTangentPlaneFailure,
  type PointQueryTangentPlaneFailureReason,
} from "./point-query-controller.types";
import { pointQueryDebugDefaults } from "./point-query-debug-defaults";

export type ObservedClientPosition = AnnotationScreenPosition & {
  timestampMs: number;
};

export const createInitialTangentPlaneFailureCounts = (): Record<
  PointQueryTangentPlaneFailureReason,
  number
> => ({
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_SCREEN_POSITION]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_POINT]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.MISSING_TRUE_DISC_NORMAL]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_SAMPLE_MISS]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.TRUE_NORMAL_MISS]: 0,
  [POINT_QUERY_TANGENT_PLANE_FAILURE_REASONS.REPROJECTION_MISS]: 0,
});

/** Appends the item and drops the oldest ones beyond `maxCount`. */
export const pushCapped = <T>(items: T[], item: T, maxCount: number) => {
  items.push(item);
  if (items.length > maxCount) {
    items.splice(0, items.length - maxCount);
  }
};

export const cloneScreenVector = (
  value: AnnotationScreenPosition | null
): AnnotationScreenPosition | null => (value ? { ...value } : null);

export const cloneTangentPlaneFailure = (
  failure: PointQueryTangentPlaneFailure | null
) =>
  failure
    ? {
        ...failure,
        clientPosition: cloneScreenVector(failure.clientPosition),
        screenPosition: cloneScreenVector(failure.screenPosition),
      }
    : null;

export const cloneDiscOriginJump = (
  jump: PointQueryDiscOriginJump | null
): PointQueryDiscOriginJump | null =>
  jump
    ? {
        ...jump,
        previousClientPosition: cloneScreenVector(jump.previousClientPosition),
        nextClientPosition: cloneScreenVector(jump.nextClientPosition),
      }
    : null;

/** Failures of one reason near the same screen spot share a signature, to throttle their log. */
export const buildFailedPickLogSignature = (
  failure: PointQueryTangentPlaneFailure
) => {
  const bucketPx = pointQueryDebugDefaults.failedPickLog.screenBucketPx;
  return [
    failure.reason,
    failure.placementMode,
    failure.screenPosition
      ? Math.round(failure.screenPosition.x / bucketPx)
      : "none",
    failure.screenPosition
      ? Math.round(failure.screenPosition.y / bucketPx)
      : "none",
  ].join(":");
};
