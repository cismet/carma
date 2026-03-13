import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

export const INFOBOX_WIDTH_PX = 430;
export const ACTIVE_TOOL_STORAGE_KEY = "annotations-playground-active-tool.v1";

export const VALID_TOOL_TYPES = new Set<AnnotationToolType>([
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
]);

export const readInitialToolType = (): AnnotationToolType => {
  if (typeof window === "undefined") {
    return ANNOTATION_TYPE_POINT;
  }

  try {
    const storedToolType = window.localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY);
    if (
      storedToolType &&
      VALID_TOOL_TYPES.has(storedToolType as AnnotationToolType)
    ) {
      return storedToolType as AnnotationToolType;
    }
  } catch {
    // ignore storage read errors
  }

  return ANNOTATION_TYPE_POINT;
};
