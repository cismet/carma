import {
  ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE,
  ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
  ANNOTATION_LIVE_PREVIEW_TYPE_POINT,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE,
  type AnnotationLivePreviewType,
} from "../annotationLivePreview.types";

export type LivePreviewCapabilities = {
  previewIsPolylineCreateMode: boolean;
  hasActivePreviewNode: boolean;
  activePreviewSupportsDistanceLine: boolean;
  activePreviewUsesPolylineDistanceRules: boolean;
  activePreviewForceDirectDistanceLine: boolean;
  isVerticalPolygonPreview: boolean;
};

export const resolveLivePreviewCapabilities = (
  type: AnnotationLivePreviewType
): LivePreviewCapabilities => {
  const previewIsPolylineCreateMode =
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE;
  const isVerticalPolygonPreview =
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;
  const hasActivePreviewNode = type !== ANNOTATION_LIVE_PREVIEW_TYPE_NONE;
  const activePreviewSupportsDistanceLine =
    type === ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;
  const activePreviewUsesPolylineDistanceRules =
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR;
  const activePreviewForceDirectDistanceLine =
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR ||
    type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;

  return {
    previewIsPolylineCreateMode,
    hasActivePreviewNode,
    activePreviewSupportsDistanceLine,
    activePreviewUsesPolylineDistanceRules,
    activePreviewForceDirectDistanceLine,
    isVerticalPolygonPreview,
  };
};

export const isPointPreviewWithOffsetStem = (
  type: AnnotationLivePreviewType,
  verticalOffsetMeters: number
): boolean =>
  type === ANNOTATION_LIVE_PREVIEW_TYPE_POINT &&
  Math.abs(verticalOffsetMeters) > 1e-9;
