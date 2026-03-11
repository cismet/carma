import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  getNextPointLabelMetricMode,
  isPointMeasurementEntry,
  type AnnotationCollection,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
  type PointLabelMetricMode,
} from "@carma-mapping/annotations/core";

type UseAnnotationPresentationActionsParams = {
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  updateAnnotationEntryNameById: (id: string, name: string) => void;
};

export const useAnnotationPresentationActions = ({
  annotations,
  nodeChainAnnotations,
  setAnnotations,
  setNodeChainAnnotations,
  updateAnnotationEntryNameById,
}: UseAnnotationPresentationActionsParams) => {
  const updateNodeChainAnnotationNameById = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim();
      setNodeChainAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((group) => {
          if (group.id !== id) return group;
          if ((group.name ?? "") === nextName) return group;
          hasChanged = true;
          return {
            ...group,
            name: nextName.length > 0 ? nextName : undefined,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    [setNodeChainAnnotations]
  );

  const updateNodeChainAnnotationSegmentLineModeById = useCallback(
    (id: string, nextMode: LinearSegmentLineMode) => {
      setNodeChainAnnotations((previousGroups) => {
        let hasChanged = false;
        const nextGroups = previousGroups.map((group) => {
          if (group.id !== id || group.segmentLineMode === nextMode) {
            return group;
          }

          hasChanged = true;
          return {
            ...group,
            segmentLineMode: nextMode,
          };
        });

        return hasChanged ? nextGroups : previousGroups;
      });
    },
    [setNodeChainAnnotations]
  );

  const updateAnnotationNameById = useCallback(
    (id: string, name: string) => {
      const isNodeChainAnnotationId = nodeChainAnnotations.some(
        (group) => group.id === id
      );
      if (isNodeChainAnnotationId) {
        updateNodeChainAnnotationNameById(id, name);
        return;
      }

      updateAnnotationEntryNameById(id, name);
    },
    [
      nodeChainAnnotations,
      updateAnnotationEntryNameById,
      updateNodeChainAnnotationNameById,
    ]
  );

  const updateAnnotationVisualizerOptionsById = useCallback(
    (
      id: string,
      patch: {
        segmentLineMode?: LinearSegmentLineMode;
      }
    ) => {
      if (patch.segmentLineMode) {
        updateNodeChainAnnotationSegmentLineModeById(id, patch.segmentLineMode);
      }
    },
    [updateNodeChainAnnotationSegmentLineModeById]
  );

  const toggleNodeChainAnnotationVisibilityById = useCallback(
    (id: string) => {
      setNodeChainAnnotations((previousGroups) => {
        let hasChanged = false;
        const nextGroups = previousGroups.map((group) => {
          if (group.id !== id) {
            return group;
          }

          hasChanged = true;
          return {
            ...group,
            hidden: !group.hidden,
          };
        });

        return hasChanged ? nextGroups : previousGroups;
      });
    },
    [setNodeChainAnnotations]
  );

  const toggleAnnotationsVisibilityByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      const requestedIdSet = new Set(ids);
      const targetedNodeChainIdSet = new Set(
        nodeChainAnnotations
          .filter((group) => requestedIdSet.has(group.id))
          .map((group) => group.id)
      );
      const targetedAnnotationIdSet = new Set(
        ids.filter((id) => !targetedNodeChainIdSet.has(id))
      );
      const shouldHide =
        annotations.some(
          (annotation) =>
            targetedAnnotationIdSet.has(annotation.id) && !annotation.hidden
        ) ||
        nodeChainAnnotations.some(
          (group) => targetedNodeChainIdSet.has(group.id) && !group.hidden
        );

      if (targetedAnnotationIdSet.size > 0) {
        setAnnotations((previousAnnotations) => {
          let hasChanges = false;
          const nextAnnotations = previousAnnotations.map((annotation) => {
            if (!targetedAnnotationIdSet.has(annotation.id)) {
              return annotation;
            }

            if (Boolean(annotation.hidden) === shouldHide) {
              return annotation;
            }

            hasChanges = true;
            return {
              ...annotation,
              hidden: shouldHide,
            };
          });

          return hasChanges ? nextAnnotations : previousAnnotations;
        });
      }

      if (targetedNodeChainIdSet.size > 0) {
        setNodeChainAnnotations((previousGroups) => {
          let hasChanges = false;
          const nextGroups = previousGroups.map((group) => {
            if (!targetedNodeChainIdSet.has(group.id)) {
              return group;
            }

            if (Boolean(group.hidden) === shouldHide) {
              return group;
            }

            hasChanges = true;
            return {
              ...group,
              hidden: shouldHide,
            };
          });

          return hasChanges ? nextGroups : previousGroups;
        });
      }
    },
    [annotations, nodeChainAnnotations, setAnnotations, setNodeChainAnnotations]
  );

  const toggleNodeChainAnnotationLockById = useCallback(
    (id: string) => {
      const targetGroup = nodeChainAnnotations.find((group) => group.id === id);
      if (!targetGroup || targetGroup.nodeIds.length === 0) {
        return;
      }

      const nodeIdSet = new Set(targetGroup.nodeIds);
      const shouldLock = targetGroup.nodeIds.some((nodeId) => {
        const vertex = annotations.find((entry) => entry.id === nodeId);
        return !vertex?.locked;
      });

      setAnnotations((previousAnnotations) => {
        let hasChanged = false;
        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (
            !nodeIdSet.has(annotation.id) ||
            annotation.locked === shouldLock
          ) {
            return annotation;
          }

          hasChanged = true;
          return {
            ...annotation,
            locked: shouldLock,
          };
        });

        return hasChanged ? nextAnnotations : previousAnnotations;
      });
    },
    [annotations, nodeChainAnnotations, setAnnotations]
  );

  const toggleAnnotationsLockByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      const requestedIdSet = new Set(ids);
      const targetedNodeChainAnnotations = nodeChainAnnotations.filter(
        (group) => requestedIdSet.has(group.id)
      );
      const targetedVertexIdSet = new Set(
        targetedNodeChainAnnotations.flatMap((group) => group.nodeIds)
      );
      const targetedAnnotationIdSet = new Set(
        annotations
          .filter(
            (annotation) =>
              requestedIdSet.has(annotation.id) ||
              targetedVertexIdSet.has(annotation.id)
          )
          .map((annotation) => annotation.id)
      );

      if (targetedAnnotationIdSet.size === 0) {
        return;
      }

      const shouldLock = annotations.some(
        (annotation) =>
          targetedAnnotationIdSet.has(annotation.id) && !annotation.locked
      );

      setAnnotations((previousAnnotations) => {
        let hasChanges = false;
        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (
            !targetedAnnotationIdSet.has(annotation.id) ||
            annotation.locked === shouldLock
          ) {
            return annotation;
          }

          hasChanges = true;
          return {
            ...annotation,
            locked: shouldLock,
          };
        });

        return hasChanges ? nextAnnotations : previousAnnotations;
      });
    },
    [annotations, nodeChainAnnotations, setAnnotations]
  );

  const setPointLabelMetricModeById = useCallback(
    (id: string, mode: PointLabelMetricMode) => {
      setAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
            return measurement;
          }
          const normalizedMode =
            mode === DEFAULT_POINT_LABEL_METRIC_MODE ? undefined : mode;
          if (measurement.pointLabelMode === normalizedMode) {
            return measurement;
          }
          hasChanged = true;
          return { ...measurement, pointLabelMode: normalizedMode };
        });
        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const cyclePointLabelMetricModeByMeasurementId = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
            return measurement;
          }

          const currentMode =
            measurement.pointLabelMode ?? DEFAULT_POINT_LABEL_METRIC_MODE;
          const nextMode = getNextPointLabelMetricMode(currentMode);
          const normalizedNextMode =
            nextMode === DEFAULT_POINT_LABEL_METRIC_MODE ? undefined : nextMode;

          if (measurement.pointLabelMode === normalizedNextMode) {
            return measurement;
          }

          hasChanged = true;
          return { ...measurement, pointLabelMode: normalizedNextMode };
        });

        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  return {
    updateNodeChainAnnotationNameById,
    updateNodeChainAnnotationSegmentLineModeById,
    updateAnnotationNameById,
    updateAnnotationVisualizerOptionsById,
    toggleNodeChainAnnotationVisibilityById,
    toggleAnnotationsVisibilityByIds,
    toggleNodeChainAnnotationLockById,
    toggleAnnotationsLockByIds,
    setPointLabelMetricModeById,
    cyclePointLabelMetricModeByMeasurementId,
  };
};
