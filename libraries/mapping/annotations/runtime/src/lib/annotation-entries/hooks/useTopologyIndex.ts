import { useCallback, useMemo } from "react";

import type { NodeChainAnnotation } from "@carma-mapping/annotations/core";

const EMPTY_OWNER_GROUP_IDS: readonly string[] = [];

const appendOwnerGroupId = (
  ownershipTable: Map<string, string[]>,
  key: string,
  ownerGroupId: string
) => {
  const previousOwnerGroupIds = ownershipTable.get(key);
  if (!previousOwnerGroupIds) {
    ownershipTable.set(key, [ownerGroupId]);
    return;
  }

  if (previousOwnerGroupIds.includes(ownerGroupId)) {
    return;
  }

  previousOwnerGroupIds.push(ownerGroupId);
};

export const useTopologyIndex = (
  planarMeasurementGroups: readonly NodeChainAnnotation[]
) => {
  const {
    ownerGroupIdsByPointId,
    ownerGroupIdsByEdgeRelationId,
    representativePointIdByGroupId,
  } = useMemo(() => {
    const nextOwnerGroupIdsByPointId = new Map<string, string[]>();
    const nextOwnerGroupIdsByEdgeRelationId = new Map<string, string[]>();
    const nextRepresentativePointIdByGroupId = new Map<string, string>();

    planarMeasurementGroups.forEach((group) => {
      group.nodeIds.forEach((pointId) => {
        if (!pointId) {
          return;
        }

        appendOwnerGroupId(nextOwnerGroupIdsByPointId, pointId, group.id);
        if (!nextRepresentativePointIdByGroupId.has(group.id)) {
          nextRepresentativePointIdByGroupId.set(group.id, pointId);
        }
      });

      group.edgeRelationIds.forEach((edgeRelationId) => {
        if (!edgeRelationId) {
          return;
        }

        appendOwnerGroupId(
          nextOwnerGroupIdsByEdgeRelationId,
          edgeRelationId,
          group.id
        );
      });
    });

    return {
      ownerGroupIdsByPointId: nextOwnerGroupIdsByPointId,
      ownerGroupIdsByEdgeRelationId: nextOwnerGroupIdsByEdgeRelationId,
      representativePointIdByGroupId: nextRepresentativePointIdByGroupId,
    };
  }, [planarMeasurementGroups]);

  const getOwnerGroupIdsForPointId = useCallback(
    (pointId: string | null | undefined): readonly string[] => {
      if (!pointId) {
        return EMPTY_OWNER_GROUP_IDS;
      }

      return ownerGroupIdsByPointId.get(pointId) ?? EMPTY_OWNER_GROUP_IDS;
    },
    [ownerGroupIdsByPointId]
  );

  const getOwnerGroupIdsForEdgeRelationId = useCallback(
    (edgeRelationId: string | null | undefined): readonly string[] => {
      if (!edgeRelationId) {
        return EMPTY_OWNER_GROUP_IDS;
      }

      return (
        ownerGroupIdsByEdgeRelationId.get(edgeRelationId) ??
        EMPTY_OWNER_GROUP_IDS
      );
    },
    [ownerGroupIdsByEdgeRelationId]
  );

  const getRepresentativePointIdForGroupId = useCallback(
    (groupId: string | null | undefined): string | null => {
      if (!groupId) {
        return null;
      }

      return representativePointIdByGroupId.get(groupId) ?? null;
    },
    [representativePointIdByGroupId]
  );

  return {
    getOwnerGroupIdsForPointId,
    getOwnerGroupIdsForEdgeRelationId,
    getRepresentativePointIdForGroupId,
  };
};

export type MeasurementOwnershipIndex = ReturnType<typeof useTopologyIndex>;
