import { useCallback } from "react";

import { Cartesian3 } from "@carma/cesium";
import {
  type DirectLineLabelMode,
  getDistanceRelationId,
  getMeasurementEdgeId,
  isSameDistanceRelationPair,
  type ReferenceLineLabelKind,
  withDistanceRelationEdgeId,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

type UseDistanceMeasureAuthoringParams = {
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
  defaultDirectLineLabelMode: DirectLineLabelMode;
  distanceModeStickyToFirstPoint: boolean;
  distanceRelations: PointDistanceRelation[];
  doubleClickChainSourcePointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  referencePointMeasurementId: string | null;
  clearMeasurementDraftSession: () => void;
  selectAnnotationById: (id: string | null) => void;
  selectAnnotationByIdImmediate: (id: string | null) => void;
  setDoubleClickChainSourcePointId: (id: string | null) => void;
  setDistanceRelations: React.Dispatch<
    React.SetStateAction<PointDistanceRelation[]>
  >;
  setActiveNodeChainAnnotationId: (id: string | null) => void;
  setReferencePoint: React.Dispatch<React.SetStateAction<Cartesian3 | null>>;
  trackMeasurementDraftPointIds: (ids: string[]) => void;
  trackMeasurementDraftRelationId: (id: string | null) => void;
};

export const useDistanceMeasureAuthoring = ({
  distanceCreationLineVisibility,
  defaultDistanceRelationLabelVisibility,
  defaultDirectLineLabelMode,
  distanceModeStickyToFirstPoint,
  distanceRelations,
  doubleClickChainSourcePointId,
  selectablePointIds,
  referencePointMeasurementId,
  clearMeasurementDraftSession,
  selectAnnotationById,
  selectAnnotationByIdImmediate,
  setDoubleClickChainSourcePointId,
  setDistanceRelations,
  setActiveNodeChainAnnotationId,
  setReferencePoint,
  trackMeasurementDraftPointIds,
  trackMeasurementDraftRelationId,
}: UseDistanceMeasureAuthoringParams) => {
  const finishDistanceMeasurementSession = useCallback(
    (selectedPointId: string | null, immediateSelection: boolean = false) => {
      clearMeasurementDraftSession();
      setDoubleClickChainSourcePointId(null);
      if (selectedPointId === null) {
        return;
      }

      if (immediateSelection) {
        selectAnnotationByIdImmediate(selectedPointId);
        return;
      }

      selectAnnotationById(selectedPointId);
    },
    [
      clearMeasurementDraftSession,
      selectAnnotationById,
      selectAnnotationByIdImmediate,
      setDoubleClickChainSourcePointId,
    ]
  );

  const resolveDistanceRelationSourcePointId = useCallback(
    (targetPointId: string) => {
      if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
        return referencePointMeasurementId === targetPointId
          ? null
          : referencePointMeasurementId;
      }

      const hasChainSource = Boolean(
        doubleClickChainSourcePointId &&
          selectablePointIds.has(doubleClickChainSourcePointId)
      );
      if (!hasChainSource) {
        return null;
      }

      return doubleClickChainSourcePointId === targetPointId
        ? null
        : doubleClickChainSourcePointId;
    },
    [
      distanceModeStickyToFirstPoint,
      doubleClickChainSourcePointId,
      selectablePointIds,
      referencePointMeasurementId,
    ]
  );

  const upsertDirectDistanceRelation = useCallback(
    (sourcePointId: string, targetPointId: string) => {
      if (!sourcePointId || !targetPointId || sourcePointId === targetPointId) {
        return;
      }

      setDistanceRelations((previousRelations) => {
        const relationIndex = previousRelations.findIndex((relation) =>
          isSameDistanceRelationPair(relation, sourcePointId, targetPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(previousRelations[relationIndex])
            : ({
                id: getDistanceRelationId(sourcePointId, targetPointId),
                edgeId: getMeasurementEdgeId(sourcePointId, targetPointId),
                pointAId: sourcePointId,
                pointBId: targetPointId,
                anchorPointId: sourcePointId,
                showDirectLine: distanceCreationLineVisibility.direct,
                showVerticalLine: distanceCreationLineVisibility.vertical,
                showHorizontalLine: distanceCreationLineVisibility.horizontal,
                showComponentLines:
                  distanceCreationLineVisibility.vertical ||
                  distanceCreationLineVisibility.horizontal,
                labelVisibilityByKind: defaultDistanceRelationLabelVisibility,
              } satisfies PointDistanceRelation);

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(sourcePointId, targetPointId),
          anchorPointId: sourcePointId,
          showDirectLine:
            relation.showDirectLine ?? distanceCreationLineVisibility.direct,
          showVerticalLine:
            relation.showVerticalLine ??
            relation.showComponentLines ??
            distanceCreationLineVisibility.vertical,
          showHorizontalLine:
            relation.showHorizontalLine ??
            relation.showComponentLines ??
            distanceCreationLineVisibility.horizontal,
          showComponentLines:
            relation.showComponentLines ??
            relation.showVerticalLine ??
            relation.showHorizontalLine ??
            (distanceCreationLineVisibility.vertical ||
              distanceCreationLineVisibility.horizontal),
          labelVisibilityByKind: {
            ...defaultDistanceRelationLabelVisibility,
            ...(relation.labelVisibilityByKind ?? {}),
          },
          directLabelMode:
            relation.directLabelMode ?? defaultDirectLineLabelMode,
        };

        if (relationIndex < 0) {
          return [...previousRelations, nextRelation];
        }

        return previousRelations.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [
      defaultDirectLineLabelMode,
      defaultDistanceRelationLabelVisibility,
      distanceCreationLineVisibility,
      setDistanceRelations,
    ]
  );

  const handleDistancePointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);
      const directRelationId = sourcePointId
        ? getDistanceRelationId(sourcePointId, newPointId)
        : null;
      const relationAlreadyExists = directRelationId
        ? distanceRelations.some((relation) => relation.id === directRelationId)
        : false;

      trackMeasurementDraftPointIds([newPointId]);
      if (sourcePointId) {
        upsertDirectDistanceRelation(sourcePointId, newPointId);
        if (!relationAlreadyExists) {
          trackMeasurementDraftRelationId(directRelationId);
        }
      }

      setActiveNodeChainAnnotationId(null);
      if (distanceModeStickyToFirstPoint) {
        if (!referencePointMeasurementId) {
          setReferencePoint(newPointPositionECEF);
        }
        setDoubleClickChainSourcePointId(
          referencePointMeasurementId ?? newPointId
        );
      } else if (sourcePointId) {
        finishDistanceMeasurementSession(newPointId, true);
      } else {
        setDoubleClickChainSourcePointId(newPointId);
      }

      if (!sourcePointId || distanceModeStickyToFirstPoint) {
        selectAnnotationByIdImmediate(newPointId);
      }
    },
    [
      distanceModeStickyToFirstPoint,
      distanceRelations,
      finishDistanceMeasurementSession,
      referencePointMeasurementId,
      resolveDistanceRelationSourcePointId,
      selectAnnotationByIdImmediate,
      setActiveNodeChainAnnotationId,
      setDoubleClickChainSourcePointId,
      setReferencePoint,
      trackMeasurementDraftPointIds,
      trackMeasurementDraftRelationId,
      upsertDirectDistanceRelation,
    ]
  );

  return {
    finishDistanceMeasurementSession,
    handleDistancePointCreated,
    resolveDistanceRelationSourcePointId,
    upsertDirectDistanceRelation,
  };
};

export type DistanceMeasureAuthoringState = ReturnType<
  typeof useDistanceMeasureAuthoring
>;
