import type { PointDistanceRelation } from "../types/distanceRelation";
import type {
  PlanarMeasurementGroup,
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
} from "../types/planarTypes";
import type { ReferenceLineLabelKind } from "../visualization/distance/distanceRelationLabel.types";

const DEFAULT_NUMERIC_EPSILON = 1e-9;

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

const areOptionalNumbersEqual = (
  left: number | undefined,
  right: number | undefined,
  epsilon: number = DEFAULT_NUMERIC_EPSILON
) => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return Math.abs(left - right) <= epsilon;
};

const areCartesian3JsonEqual = (
  left:
    | {
        x: number;
        y: number;
        z: number;
      }
    | undefined,
  right:
    | {
        x: number;
        y: number;
        z: number;
      }
    | undefined,
  epsilon: number = DEFAULT_NUMERIC_EPSILON
) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.z - right.z) <= epsilon
  );
};

const arePlanarPolygonPlanesEqual = (
  left: PlanarPolygonPlane | undefined,
  right: PlanarPolygonPlane | undefined,
  epsilon: number = DEFAULT_NUMERIC_EPSILON
) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    areCartesian3JsonEqual(left.anchorECEF, right.anchorECEF, epsilon) &&
    areCartesian3JsonEqual(left.normalECEF, right.normalECEF, epsilon)
  );
};

const arePlanarPolygonLocalFramesEqual = (
  left: PlanarPolygonLocalFrame | undefined,
  right: PlanarPolygonLocalFrame | undefined,
  epsilon: number = DEFAULT_NUMERIC_EPSILON
) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    areCartesian3JsonEqual(left.originECEF, right.originECEF, epsilon) &&
    areCartesian3JsonEqual(left.eastECEF, right.eastECEF, epsilon) &&
    areCartesian3JsonEqual(left.northECEF, right.northECEF, epsilon) &&
    areCartesian3JsonEqual(left.upECEF, right.upECEF, epsilon)
  );
};

export const arePlanarPolygonGroupsEquivalent = (
  left: PlanarMeasurementGroup,
  right: PlanarMeasurementGroup,
  epsilon: number = DEFAULT_NUMERIC_EPSILON
) =>
  left === right ||
  (left.id === right.id &&
    left.name === right.name &&
    left.hidden === right.hidden &&
    left.type === right.type &&
    left.segmentLineMode === right.segmentLineMode &&
    areOptionalNumbersEqual(
      left.verticalOffsetMeters,
      right.verticalOffsetMeters,
      epsilon
    ) &&
    areStringArraysEqual(left.vertexPointIds, right.vertexPointIds) &&
    areStringArraysEqual(left.edgeRelationIds, right.edgeRelationIds) &&
    left.distanceMeasurementStartPointId ===
      right.distanceMeasurementStartPointId &&
    left.closed === right.closed &&
    left.planeLocked === right.planeLocked &&
    arePlanarPolygonPlanesEqual(left.plane, right.plane, epsilon) &&
    arePlanarPolygonLocalFramesEqual(
      left.planarPolygonLocalFrame,
      right.planarPolygonLocalFrame,
      epsilon
    ) &&
    areOptionalNumbersEqual(
      left.perimeterMeters,
      right.perimeterMeters,
      epsilon
    ) &&
    areOptionalNumbersEqual(
      left.areaSquareMeters,
      right.areaSquareMeters,
      epsilon
    ) &&
    areOptionalNumbersEqual(
      left.verticalityDeg,
      right.verticalityDeg,
      epsilon
    ) &&
    areOptionalNumbersEqual(left.bearingDeg, right.bearingDeg, epsilon));

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
