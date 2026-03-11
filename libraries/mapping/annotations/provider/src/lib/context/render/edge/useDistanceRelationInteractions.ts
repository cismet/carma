import { useCallback } from "react";

import {
  getConnectedOpenPolylineGroupIds,
  getNextDirectLineLabelMode,
  type DirectLineLabelMode,
  type NodeChainAnnotation,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

type UseDistanceRelationInteractionsParams = {
  activeNodeChainAnnotationId: string | null;
  focusedNodeChainAnnotationId: string | null;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
  defaultDirectLineLabelMode: DirectLineLabelMode;
  setDistanceRelations: React.Dispatch<
    React.SetStateAction<PointDistanceRelation[]>
  >;
  selectRepresentativeNodeForMeasurementId: (id: string | null) => void;
  getOwnerGroupIdsForEdgeRelationId: (
    relationId: string | null | undefined
  ) => readonly string[];
};

export const useDistanceRelationInteractions = ({
  activeNodeChainAnnotationId,
  focusedNodeChainAnnotationId,
  nodeChainAnnotations,
  defaultDistanceRelationLabelVisibility,
  defaultDirectLineLabelMode,
  setDistanceRelations,
  selectRepresentativeNodeForMeasurementId,
  getOwnerGroupIdsForEdgeRelationId,
}: UseDistanceRelationInteractionsParams) => {
  const toggleDistanceRelationLineLabelVisibility = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) {
        return;
      }

      setDistanceRelations((previousRelations) =>
        previousRelations.map((relation) => {
          if (relation.id !== relationId) {
            return relation;
          }

          const currentValue =
            relation.labelVisibilityByKind?.[kind] ??
            defaultDistanceRelationLabelVisibility[kind];

          return {
            ...relation,
            labelVisibilityByKind: {
              ...defaultDistanceRelationLabelVisibility,
              ...(relation.labelVisibilityByKind ?? {}),
              [kind]: !currentValue,
            },
          };
        })
      );
    },
    [defaultDistanceRelationLabelVisibility, setDistanceRelations]
  );

  const handleDistanceRelationLineLabelToggle = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) {
        return;
      }

      const ownerGroupIds = getOwnerGroupIdsForEdgeRelationId(relationId);
      const focusedGroupOwnsRelation =
        !!focusedNodeChainAnnotationId &&
        ownerGroupIds.includes(focusedNodeChainAnnotationId);

      if (ownerGroupIds.length > 0 && !focusedGroupOwnsRelation) {
        const preferredOwnerGroupId =
          (activeNodeChainAnnotationId &&
          ownerGroupIds.includes(activeNodeChainAnnotationId)
            ? activeNodeChainAnnotationId
            : ownerGroupIds[0]) ?? null;
        selectRepresentativeNodeForMeasurementId(preferredOwnerGroupId);
        return;
      }

      if (kind === "direct" && focusedNodeChainAnnotationId) {
        const connectedOpenGroupIds = getConnectedOpenPolylineGroupIds(
          nodeChainAnnotations,
          focusedNodeChainAnnotationId
        );
        if (connectedOpenGroupIds.size > 0) {
          const allRelationIds = new Set<string>();
          nodeChainAnnotations.forEach((measurement) => {
            if (!connectedOpenGroupIds.has(measurement.id)) {
              return;
            }
            measurement.edgeRelationIds.forEach((edgeRelationId) =>
              allRelationIds.add(edgeRelationId)
            );
          });

          if (allRelationIds.size > 0) {
            setDistanceRelations((previousRelations) => {
              const currentMode: DirectLineLabelMode =
                previousRelations.find((relation) => relation.id === relationId)
                  ?.directLabelMode ?? defaultDirectLineLabelMode;
              const nextMode = getNextDirectLineLabelMode(currentMode);

              return previousRelations.map((relation) => {
                if (!allRelationIds.has(relation.id)) {
                  return relation;
                }

                return {
                  ...relation,
                  directLabelMode: nextMode,
                  labelVisibilityByKind: {
                    ...defaultDistanceRelationLabelVisibility,
                    ...(relation.labelVisibilityByKind ?? {}),
                    direct: nextMode !== "none",
                  },
                };
              });
            });
            return;
          }
        }
      }

      toggleDistanceRelationLineLabelVisibility(relationId, kind);
    },
    [
      activeNodeChainAnnotationId,
      defaultDirectLineLabelMode,
      defaultDistanceRelationLabelVisibility,
      focusedNodeChainAnnotationId,
      getOwnerGroupIdsForEdgeRelationId,
      nodeChainAnnotations,
      selectRepresentativeNodeForMeasurementId,
      setDistanceRelations,
      toggleDistanceRelationLineLabelVisibility,
    ]
  );

  const handleDistanceRelationLineClick = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId || kind !== "direct") {
        return;
      }

      const ownerGroupIds = getOwnerGroupIdsForEdgeRelationId(relationId);
      const focusedGroupOwnsRelation =
        !!focusedNodeChainAnnotationId &&
        ownerGroupIds.includes(focusedNodeChainAnnotationId);

      if (ownerGroupIds.length > 0) {
        if (focusedGroupOwnsRelation) {
          return;
        }

        const preferredOwnerGroupId =
          (activeNodeChainAnnotationId &&
          ownerGroupIds.includes(activeNodeChainAnnotationId)
            ? activeNodeChainAnnotationId
            : ownerGroupIds[0]) ?? null;
        selectRepresentativeNodeForMeasurementId(preferredOwnerGroupId);
      }
    },
    [
      activeNodeChainAnnotationId,
      focusedNodeChainAnnotationId,
      getOwnerGroupIdsForEdgeRelationId,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  return {
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
  };
};

export type DistanceRelationInteractionsState = ReturnType<
  typeof useDistanceRelationInteractions
>;
