import { useMemo, type MouseEvent as ReactMouseEvent } from "react";

import {
  getCustomPointMeasurementName,
  getENU,
  getEuclideanDistance,
  isPointMeasurementEntry,
  type MeasurementEntry,
  type PointMeasurementEntry,
  type PointDistanceRelation,
  useCesiumMeasurements,
} from "@carma-mapping/engines/cesium/measurements";

import {
  getDistanceRelationId,
  getDistanceRelationLineVisibilityByKind,
  getMeasurementEdgeId,
} from "./InfoBoxMeasurement3D.helpers";

type DistanceLineVisibilityKind =
  | "direct"
  | "vertical"
  | "horizontal"
  | "components";

const DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY = {
  direct: true,
  vertical: true,
  horizontal: true,
} as const;

type UseInfoBoxDistanceRelationsStateParams = {
  currentMeasurement?: MeasurementEntry;
  pointMeasurements: PointMeasurementEntry[];
  referencePointMeasurementId: string | null;
};

export const useInfoBoxDistanceRelationsState = ({
  currentMeasurement,
  pointMeasurements,
  referencePointMeasurementId,
}: UseInfoBoxDistanceRelationsStateParams) => {
  const { distanceRelations, setDistanceRelations } = useCesiumMeasurements();

  const removeDistanceRelationById = (
    relationId: string,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    setDistanceRelations((prev) =>
      prev.filter((relation) => relation.id !== relationId)
    );
  };

  const addDistanceRelationForCurrentPoint = (
    relatedPointId: string,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }

    const currentPointId = currentMeasurement.id;
    if (!relatedPointId || relatedPointId === currentPointId) return;

    setDistanceRelations((prev: PointDistanceRelation[]) => {
      const existingIndex = prev.findIndex(
        (relation) =>
          (relation.pointAId === currentPointId &&
            relation.pointBId === relatedPointId) ||
          (relation.pointAId === relatedPointId &&
            relation.pointBId === currentPointId)
      );

      if (existingIndex >= 0) return prev;

      return [
        ...prev,
        {
          id: getDistanceRelationId(currentPointId, relatedPointId),
          edgeId: getMeasurementEdgeId(currentPointId, relatedPointId),
          pointAId: currentPointId,
          pointBId: relatedPointId,
          anchorPointId: currentPointId,
          showDirectLine: true,
          showVerticalLine: false,
          showHorizontalLine: false,
          showComponentLines: false,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
          },
        },
      ];
    });
  };

  const toggleDistanceRelationLineVisibilityByKind = (
    relationId: string,
    kind: DistanceLineVisibilityKind,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    if (!relationId) return;

    setDistanceRelations((prev) =>
      prev.map((relation) => {
        if (relation.id !== relationId) return relation;
        const currentVisibility =
          getDistanceRelationLineVisibilityByKind(relation);

        const nextVisibility =
          kind === "direct"
            ? {
                ...currentVisibility,
                direct: !currentVisibility.direct,
              }
            : kind === "components"
            ? {
                ...currentVisibility,
                vertical:
                  !currentVisibility.vertical || !currentVisibility.horizontal,
                horizontal:
                  !currentVisibility.vertical || !currentVisibility.horizontal,
              }
            : kind === "vertical"
            ? {
                ...currentVisibility,
                vertical: !currentVisibility.vertical,
              }
            : {
                ...currentVisibility,
                horizontal: !currentVisibility.horizontal,
              };

        return {
          ...relation,
          showDirectLine: nextVisibility.direct,
          showVerticalLine: nextVisibility.vertical,
          showHorizontalLine: nextVisibility.horizontal,
          showComponentLines:
            nextVisibility.vertical || nextVisibility.horizontal,
        };
      })
    );
  };

  const pointRelationRows = useMemo(() => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return [];
    }

    const currentPointId = currentMeasurement.id;
    const rows = distanceRelations
      .map((relation) => {
        if (
          relation.pointAId !== currentPointId &&
          relation.pointBId !== currentPointId
        ) {
          return null;
        }

        const relatedPointId =
          relation.pointAId === currentPointId
            ? relation.pointBId
            : relation.pointAId;
        const relatedPoint = pointMeasurements.find(
          (measurement) => measurement.id === relatedPointId
        );
        if (!relatedPoint) return null;

        const relatedPointIndex = pointMeasurements.findIndex(
          (measurement) => measurement.id === relatedPointId
        );
        const relatedPointLabel =
          getCustomPointMeasurementName(relatedPoint.name) ??
          `${relatedPointIndex + 1}`;
        const enu = getENU(
          currentMeasurement.geometryECEF,
          relatedPoint.geometryECEF
        );
        const horizontalDistance = Math.hypot(enu.east, enu.north);

        return {
          relationId: relation.id,
          relatedPointId,
          label: relatedPointLabel,
          isReference: relatedPointId === referencePointMeasurementId,
          isImplicitReferenceRow: false,
          elevation: enu.up,
          distance: getEuclideanDistance(
            currentMeasurement.geometryECEF,
            relatedPoint.geometryECEF
          ),
          horizontalDistance,
          lineVisibility: getDistanceRelationLineVisibilityByKind(relation),
        };
      })
      .filter(
        (
          row
        ): row is {
          relationId: string;
          relatedPointId: string;
          label: string;
          isReference: boolean;
          isImplicitReferenceRow: boolean;
          elevation: number;
          distance: number;
          horizontalDistance: number;
          lineVisibility: {
            direct: boolean;
            vertical: boolean;
            horizontal: boolean;
          };
        } => Boolean(row)
      );

    if (
      rows.length > 0 &&
      referencePointMeasurementId &&
      referencePointMeasurementId !== currentPointId &&
      !rows.some((row) => row.relatedPointId === referencePointMeasurementId)
    ) {
      const referenceMeasurement = pointMeasurements.find(
        (measurement) => measurement.id === referencePointMeasurementId
      );
      if (referenceMeasurement) {
        const referenceMeasurementIndex = pointMeasurements.findIndex(
          (measurement) => measurement.id === referencePointMeasurementId
        );
        const referencePointLabel =
          getCustomPointMeasurementName(referenceMeasurement.name) ??
          `${referenceMeasurementIndex + 1}`;
        const enu = getENU(
          currentMeasurement.geometryECEF,
          referenceMeasurement.geometryECEF
        );
        rows.push({
          relationId: "",
          relatedPointId: referencePointMeasurementId,
          label: referencePointLabel,
          isReference: true,
          isImplicitReferenceRow: true,
          elevation: enu.up,
          distance: getEuclideanDistance(
            currentMeasurement.geometryECEF,
            referenceMeasurement.geometryECEF
          ),
          horizontalDistance: Math.hypot(enu.east, enu.north),
          lineVisibility: {
            direct: false,
            vertical: false,
            horizontal: false,
          },
        });
      }
    }

    return rows.sort((left, right) => {
      if (left.isImplicitReferenceRow !== right.isImplicitReferenceRow) {
        return left.isImplicitReferenceRow ? 1 : -1;
      }
      if (left.isReference !== right.isReference) {
        return left.isReference ? 1 : -1;
      }
      return left.label.localeCompare(right.label, "de");
    });
  }, [
    currentMeasurement,
    distanceRelations,
    pointMeasurements,
    referencePointMeasurementId,
  ]);

  const currentPointHasDistanceRelations = useMemo(() => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return false;
    }
    if (currentMeasurement.distanceRelationId) {
      return true;
    }
    return distanceRelations.some(
      (relation) =>
        relation.pointAId === currentMeasurement.id ||
        relation.pointBId === currentMeasurement.id
    );
  }, [currentMeasurement, distanceRelations]);

  return {
    pointRelationRows,
    currentPointHasDistanceRelations,
    removeDistanceRelationById,
    addDistanceRelationForCurrentPoint,
    toggleDistanceRelationLineVisibilityByKind,
  };
};
