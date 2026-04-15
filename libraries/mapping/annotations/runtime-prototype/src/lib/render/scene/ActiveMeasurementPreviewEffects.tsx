import type {
  AnnotationCollection,
  AnnotationToolType,
  NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type { Scene } from "@carma-cesium";
import { useCursorOverlay } from "../../interaction/cursor/use-cursor-overlay";
import type { PreviewRuntimeController } from "../../interaction/candidate/preview-runtime";
import { useActiveDistancePreviewRuntime } from "./use-active-distance-preview-runtime";
const { DISTANCE: ANNOTATION_TYPE_DISTANCE } = ANNOTATION_TYPES;

type ActiveMeasurementPreviewEffectsProps = {
  scene: Scene;
  activeToolType: AnnotationToolType;
  previewRuntimeController: PreviewRuntimeController;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  referencePointMeasurementId: string | null;
  selectablePointIds: ReadonlySet<string>;
  activeNodeChainAnnotationId: string | null;
  annotationCursorEnabled: boolean;
  showPoints: boolean;
  pointRadius: number;
  distanceModeStickyToFirstPoint: boolean;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  suppressCandidateLabelOverlay: boolean;
};

export const ActiveMeasurementPreviewEffects = ({
  scene,
  activeToolType,
  previewRuntimeController,
  annotations,
  nodeChainAnnotations,
  referencePointMeasurementId,
  selectablePointIds,
  activeNodeChainAnnotationId,
  annotationCursorEnabled,
  showPoints,
  pointRadius,
  distanceModeStickyToFirstPoint,
  distanceCreationLineVisibility,
  suppressCandidateLabelOverlay,
}: ActiveMeasurementPreviewEffectsProps) => {
  useActiveDistancePreviewRuntime(scene, previewRuntimeController, {
    activeToolType,
    annotationCursorEnabled,
    annotations,
    nodeChainAnnotations,
    activeNodeChainAnnotationId,
    selectablePointIds,
    distanceModeStickyToFirstPoint,
    referencePointMeasurementId,
    distanceCreationLineVisibility,
    pointRadius,
    suppressCandidateLabelOverlay,
  });

  useCursorOverlay(scene, {
    enabled:
      showPoints &&
      annotationCursorEnabled &&
      activeToolType === ANNOTATION_TYPE_DISTANCE,
  });

  return null;
};
