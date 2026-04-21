import { isClose } from "@carma-commons/utils";

import type { NodeChainAnnotation } from "../types/annotation-types";
import type { PointDistanceRelation } from "../types/distance-relation";
import type { ReferenceLineLabelKind } from "../visualization/distance/distance-relation-label.types";

const annotationStateEqualityDefaults = Object.freeze({
  numericEpsilon: 1e-9,
});

const areStringArraysEqual = (
  left: readonly string[],
  right: readonly string[]
) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const areDistanceLineVisibilityEqual = (
  left:
    | {
        direct: boolean;
        vertical: boolean;
        horizontal: boolean;
      }
    | undefined,
  right:
    | {
        direct: boolean;
        vertical: boolean;
        horizontal: boolean;
      }
    | undefined
) =>
  left === right ||
  (!!left &&
    !!right &&
    left.direct === right.direct &&
    left.vertical === right.vertical &&
    left.horizontal === right.horizontal);

const areOptionalNumbersEqual = (
  left: number | undefined,
  right: number | undefined,
  epsilon: number = annotationStateEqualityDefaults.numericEpsilon
) => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return isClose(left, right, epsilon);
};

export const arePolygonAnnotationsEquivalent = (
  left: NodeChainAnnotation,
  right: NodeChainAnnotation,
  epsilon: number = annotationStateEqualityDefaults.numericEpsilon
) =>
  left === right ||
  (left.id === right.id &&
    left.name === right.name &&
    left.hidden === right.hidden &&
    left.type === right.type &&
    left.segmentLineMode === right.segmentLineMode &&
    areDistanceLineVisibilityEqual(
      left.distanceLineVisibility,
      right.distanceLineVisibility
    ) &&
    areOptionalNumbersEqual(
      left.verticalOffsetMeters,
      right.verticalOffsetMeters,
      epsilon
    ) &&
    areStringArraysEqual(left.nodeIds, right.nodeIds) &&
    areStringArraysEqual(left.edgeRelationIds, right.edgeRelationIds) &&
    left.distanceMeasurementStartPointId ===
      right.distanceMeasurementStartPointId &&
    left.closed === right.closed &&
    left.planeLocked === right.planeLocked);

const areDistanceLabelVisibilityEquivalent = (
  left: PointDistanceRelation["labelVisibilityByKind"],
  right: PointDistanceRelation["labelVisibilityByKind"],
  defaults: Readonly<Record<ReferenceLineLabelKind, boolean>>
) =>
  (left?.direct ?? defaults.direct) === (right?.direct ?? defaults.direct) &&
  (left?.vertical ?? defaults.vertical) ===
    (right?.vertical ?? defaults.vertical) &&
  (left?.horizontal ?? defaults.horizontal) ===
    (right?.horizontal ?? defaults.horizontal);

export const areDistanceRelationsEquivalent = (
  left: readonly PointDistanceRelation[],
  right: readonly PointDistanceRelation[],
  defaults: Readonly<Record<ReferenceLineLabelKind, boolean>>
) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const previous = left[index];
    const next = right[index];
    if (!previous || !next) return false;
    if (
      previous.id !== next.id ||
      previous.edgeId !== next.edgeId ||
      previous.pointAId !== next.pointAId ||
      previous.pointBId !== next.pointBId ||
      previous.anchorPointId !== next.anchorPointId ||
      previous.polygonGroupId !== next.polygonGroupId ||
      previous.showDirectLine !== next.showDirectLine ||
      previous.showVerticalLine !== next.showVerticalLine ||
      previous.showHorizontalLine !== next.showHorizontalLine ||
      previous.showComponentLines !== next.showComponentLines ||
      previous.directLabelMode !== next.directLabelMode ||
      !areDistanceLabelVisibilityEquivalent(
        previous.labelVisibilityByKind,
        next.labelVisibilityByKind,
        defaults
      )
    ) {
      return false;
    }
  }

  return true;
};
