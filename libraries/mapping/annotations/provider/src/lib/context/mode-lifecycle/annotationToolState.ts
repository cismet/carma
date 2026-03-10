import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type AnnotationMode,
  type AnnotationToolType,
  type PlanarPolygonAreaType,
} from "@carma-mapping/annotations/core";

import {
  PLANAR_TOOL_CREATION_MODE_POLYGON,
  PLANAR_TOOL_CREATION_MODE_POLYLINE,
  type PlanarToolCreationMode,
} from "../base";

export type AnnotationToolState = {
  annotationMode: AnnotationMode;
  selectionModeActive: boolean;
  pointLabelOnCreate: boolean;
  planarToolCreationMode: PlanarToolCreationMode;
  polygonSurfaceTypePreset: PlanarPolygonAreaType;
};

export const buildAnnotationToolState = (
  toolType: AnnotationToolType
): AnnotationToolState => {
  switch (toolType) {
    case SELECT_TOOL_TYPE:
      return {
        annotationMode: SELECT_TOOL_TYPE,
        selectionModeActive: true,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYLINE,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_GROUND,
      };
    case ANNOTATION_TYPE_LABEL:
      return {
        annotationMode: ANNOTATION_TYPE_POINT,
        selectionModeActive: false,
        pointLabelOnCreate: true,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYLINE,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_GROUND,
      };
    case ANNOTATION_TYPE_DISTANCE:
      return {
        annotationMode: ANNOTATION_TYPE_DISTANCE,
        selectionModeActive: false,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYLINE,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_GROUND,
      };
    case ANNOTATION_TYPE_POLYLINE:
      return {
        annotationMode: ANNOTATION_TYPE_POLYLINE,
        selectionModeActive: false,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYLINE,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_GROUND,
      };
    case ANNOTATION_TYPE_AREA_GROUND:
      return {
        annotationMode: ANNOTATION_TYPE_POLYLINE,
        selectionModeActive: false,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYGON,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_GROUND,
      };
    case ANNOTATION_TYPE_AREA_VERTICAL:
      return {
        annotationMode: ANNOTATION_TYPE_POLYLINE,
        selectionModeActive: false,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYGON,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_VERTICAL,
      };
    case ANNOTATION_TYPE_AREA_PLANAR:
      return {
        annotationMode: ANNOTATION_TYPE_POLYLINE,
        selectionModeActive: false,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYGON,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_PLANAR,
      };
    case ANNOTATION_TYPE_POINT:
    default:
      return {
        annotationMode: ANNOTATION_TYPE_POINT,
        selectionModeActive: false,
        pointLabelOnCreate: false,
        planarToolCreationMode: PLANAR_TOOL_CREATION_MODE_POLYLINE,
        polygonSurfaceTypePreset: ANNOTATION_TYPE_AREA_GROUND,
      };
  }
};

export const resolveActiveAnnotationToolType = (
  annotationMode: AnnotationMode,
  selectionModeActive: boolean,
  pointLabelOnCreate: boolean,
  planarToolCreationMode: PlanarToolCreationMode,
  polygonSurfaceTypePreset: PlanarPolygonAreaType
): AnnotationToolType => {
  if (selectionModeActive) {
    return SELECT_TOOL_TYPE;
  }

  if (pointLabelOnCreate && annotationMode === ANNOTATION_TYPE_POINT) {
    return ANNOTATION_TYPE_LABEL;
  }

  if (annotationMode === ANNOTATION_TYPE_DISTANCE) {
    return ANNOTATION_TYPE_DISTANCE;
  }

  if (annotationMode === ANNOTATION_TYPE_POLYLINE) {
    if (planarToolCreationMode === PLANAR_TOOL_CREATION_MODE_POLYGON) {
      return polygonSurfaceTypePreset;
    }
    return ANNOTATION_TYPE_POLYLINE;
  }

  return ANNOTATION_TYPE_POINT;
};

export const isPlanarMeasurementToolType = (
  toolType: AnnotationToolType
): toolType is
  | typeof ANNOTATION_TYPE_POLYLINE
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_VERTICAL
  | typeof ANNOTATION_TYPE_AREA_PLANAR =>
  toolType === ANNOTATION_TYPE_POLYLINE ||
  toolType === ANNOTATION_TYPE_AREA_GROUND ||
  toolType === ANNOTATION_TYPE_AREA_VERTICAL ||
  toolType === ANNOTATION_TYPE_AREA_PLANAR;

export const isAreaToolType = (
  toolType: AnnotationToolType
): toolType is
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_VERTICAL
  | typeof ANNOTATION_TYPE_AREA_PLANAR =>
  toolType === ANNOTATION_TYPE_AREA_GROUND ||
  toolType === ANNOTATION_TYPE_AREA_VERTICAL ||
  toolType === ANNOTATION_TYPE_AREA_PLANAR;
