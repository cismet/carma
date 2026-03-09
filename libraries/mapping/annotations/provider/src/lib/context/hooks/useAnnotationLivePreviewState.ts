import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Cartesian2, Cartesian3, type Scene } from "@carma/cesium";

import type {
  AnnotationCollection,
  PlanarPolygonGroup,
} from "@carma-mapping/annotations/core";

import { resolveLivePreviewCapabilities } from "./live-preview/livePreviewCapabilities";
import { usePointLivePreviewState } from "./live-preview/usePointLivePreviewState";
import { useVerticalPolygonLivePreview } from "./live-preview/useVerticalPolygonLivePreview";
import {
  ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE,
  ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
  ANNOTATION_LIVE_PREVIEW_TYPE_POINT,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE,
  type AnnotationLivePreviewDescriptor,
} from "./annotationLivePreview.types";

export {
  ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE,
  ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
  ANNOTATION_LIVE_PREVIEW_TYPE_POINT,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE,
  type AnnotationLivePreviewDescriptor,
} from "./annotationLivePreview.types";

type UseAnnotationLivePreviewStateParams = {
  scene: Scene | null;
  activePreview: AnnotationLivePreviewDescriptor;
  pointQueryEnabled: boolean;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  annotations: AnnotationCollection;
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarPolygonGroup[]>>;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  getFacadeRectanglePreviewAreaSquareMeters: (
    firstVertexECEF: Cartesian3,
    oppositeVertexECEF: Cartesian3
  ) => number;
};

type UseAnnotationLivePreviewStateResult = {
  livePreviewPointECEF: Cartesian3 | null;
  livePreviewSurfaceNormalECEF: Cartesian3 | null;
  livePreviewVerticalOffsetAnchorECEF: Cartesian3 | null;
  handlePointQueryPointerMove: (
    positionECEF: Cartesian3 | null,
    screenPosition?: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
  previewIsPolylineCreateMode: boolean;
  hasActivePreviewNode: boolean;
  activePreviewSupportsDistanceLine: boolean;
  activePreviewUsesPolylineDistanceRules: boolean;
  activePreviewForceDirectDistanceLine: boolean;
  isLivePointPreviewModeActive: boolean;
};

export const useAnnotationLivePreviewState = ({
  scene,
  activePreview,
  pointQueryEnabled,
  moveGizmoPointId,
  isMoveGizmoDragging,
  annotations,
  setPlanarPolygonGroups,
  getPositionWithVerticalOffsetFromAnchor,
  getFacadeRectanglePreviewAreaSquareMeters,
}: UseAnnotationLivePreviewStateParams): UseAnnotationLivePreviewStateResult => {
  const capabilities = resolveLivePreviewCapabilities(activePreview.type);
  const {
    previewIsPolylineCreateMode,
    hasActivePreviewNode,
    activePreviewSupportsDistanceLine,
    activePreviewUsesPolylineDistanceRules,
    activePreviewForceDirectDistanceLine,
    isVerticalPolygonPreview,
  } = capabilities;

  const {
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    livePreviewVerticalOffsetAnchorECEF,
    updatePointPreviewFromPointerMove,
    clearPointPreview,
  } = usePointLivePreviewState({
    scene,
    activePreviewType: activePreview.type,
    verticalOffsetMeters: activePreview.verticalOffsetMeters,
    hasActivePreviewNode,
    getPositionWithVerticalOffsetFromAnchor,
  });

  const updateVerticalPolygonPreview = useVerticalPolygonLivePreview({
    scene,
    isVerticalPolygonPreview,
    activePreview,
    annotations,
    setPlanarPolygonGroups,
    getFacadeRectanglePreviewAreaSquareMeters,
  });

  const handlePointQueryPointerMove = useCallback(
    (
      positionECEF: Cartesian3 | null,
      _screenPosition?: Cartesian2,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      updatePointPreviewFromPointerMove(positionECEF, surfaceNormalECEF);
      updateVerticalPolygonPreview(positionECEF);
    },
    [updatePointPreviewFromPointerMove, updateVerticalPolygonPreview]
  );

  const isLivePointPreviewModeActive =
    hasActivePreviewNode &&
    pointQueryEnabled &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;

  useEffect(() => {
    if (isLivePointPreviewModeActive) return;
    clearPointPreview();
  }, [clearPointPreview, isLivePointPreviewModeActive]);

  return {
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    livePreviewVerticalOffsetAnchorECEF,
    handlePointQueryPointerMove,
    previewIsPolylineCreateMode,
    hasActivePreviewNode,
    activePreviewSupportsDistanceLine,
    activePreviewUsesPolylineDistanceRules,
    activePreviewForceDirectDistanceLine,
    isLivePointPreviewModeActive,
  };
};
