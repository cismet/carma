import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  ANNOTATION_CANDIDATE_KINDS,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { type Scene } from "@carma-cesium";
import { getPositionWithVerticalOffsetFromAnchor } from "@carma-mapping/engines/cesium/core";
import { useCandidateState } from "../candidate/use-candidate-state";
import type { AnnotationCandidateDescriptor } from "@carma-mapping/annotations/core";
import type { PreviewRuntimeController } from "./preview-runtime";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;
const {
  DISTANCE: ANNOTATION_CANDIDATE_KIND_DISTANCE,
  NONE: ANNOTATION_CANDIDATE_KIND_NONE,
  POINT: ANNOTATION_CANDIDATE_KIND_POINT,
  POLYGON_GROUND: ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  POLYGON_PLANAR: ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  POLYGON_VERTICAL: ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  POLYLINE: ANNOTATION_CANDIDATE_KIND_POLYLINE,
} = ANNOTATION_CANDIDATE_KINDS;

type UseAnnotationCursorCandidateStateParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  activeToolType: AnnotationToolType;
  activeNodeChainAnnotationId: string | null;
  labelInputPromptPointId: string | null;
  nodeChainAnnotations: NodeChainAnnotation[];
  pointVerticalOffsetMeters: number;
  polylineVerticalOffsetMeters: number;
  pointQueryEnabled: boolean;
  previewRuntimeController: PreviewRuntimeController;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
};

export const useCursorCandidateState = ({
  scene,
  annotations,
  activeToolType,
  activeNodeChainAnnotationId,
  labelInputPromptPointId,
  nodeChainAnnotations,
  pointVerticalOffsetMeters,
  polylineVerticalOffsetMeters,
  pointQueryEnabled,
  previewRuntimeController,
  moveGizmoPointId,
  isMoveGizmoDragging,
  setNodeChainAnnotations,
}: UseAnnotationCursorCandidateStateParams) => {
  const annotationCandidateDescriptor =
    useMemo<AnnotationCandidateDescriptor>(() => {
      if (activeToolType === ANNOTATION_TYPE_POINT) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POINT,
          verticalOffsetMeters: pointVerticalOffsetMeters,
        };
      }

      if (activeToolType === ANNOTATION_TYPE_LABEL) {
        if (labelInputPromptPointId) {
          return {
            kind: ANNOTATION_CANDIDATE_KIND_NONE,
            verticalOffsetMeters: 0,
          };
        }
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POINT,
          verticalOffsetMeters: 0,
        };
      }

      if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_DISTANCE,
          verticalOffsetMeters: 0,
        };
      }

      if (activeToolType === ANNOTATION_TYPE_POLYLINE) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYLINE,
          verticalOffsetMeters: polylineVerticalOffsetMeters,
        };
      }

      if (
        activeToolType !== ANNOTATION_TYPE_AREA_GROUND &&
        activeToolType !== ANNOTATION_TYPE_AREA_VERTICAL &&
        activeToolType !== ANNOTATION_TYPE_AREA_PLANAR
      ) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_NONE,
          verticalOffsetMeters: 0,
        };
      }

      const activeOpenPolygonGroup = activeNodeChainAnnotationId
        ? nodeChainAnnotations.find(
            (group) => group.id === activeNodeChainAnnotationId && !group.closed
          ) ?? null
        : null;
      const effectiveType = activeOpenPolygonGroup?.type ?? activeToolType;

      if (effectiveType === ANNOTATION_TYPE_AREA_VERTICAL) {
        const firstNodeId =
          activeOpenPolygonGroup?.nodeIds.length === 1
            ? activeOpenPolygonGroup.nodeIds[0]
            : null;
        if (firstNodeId && activeOpenPolygonGroup) {
          return {
            kind: ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
            verticalOffsetMeters: 0,
            verticalPolygonContext: {
              groupId: activeOpenPolygonGroup.id,
              firstNodeId,
            },
          };
        }
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
          verticalOffsetMeters: 0,
        };
      }

      if (effectiveType === ANNOTATION_TYPE_AREA_GROUND) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
          verticalOffsetMeters: 0,
        };
      }

      if (effectiveType === ANNOTATION_TYPE_AREA_PLANAR) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
          verticalOffsetMeters: 0,
        };
      }

      return {
        kind: ANNOTATION_CANDIDATE_KIND_NONE,
        verticalOffsetMeters: 0,
      };
    }, [
      activeToolType,
      activeNodeChainAnnotationId,
      labelInputPromptPointId,
      nodeChainAnnotations,
      pointVerticalOffsetMeters,
      polylineVerticalOffsetMeters,
    ]);

  return useCandidateState(scene, annotations, annotationCandidateDescriptor, {
    pointQueryEnabled,
    previewRuntimeController,
    moveGizmoPointId,
    isMoveGizmoDragging,
    setNodeChainAnnotations,
    getPositionWithVerticalOffsetFromAnchor,
  });
};
