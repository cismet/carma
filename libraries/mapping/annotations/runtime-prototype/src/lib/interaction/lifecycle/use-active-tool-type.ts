import { useMemo } from "react";

import {
  type AnnotationToolType,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
const { SELECT: SELECT_TOOL_TYPE } = ANNOTATION_TOOL_TYPES;
export const useActiveToolType = (
  annotationToolType: AnnotationToolType,
  selectionModeActive: boolean
): AnnotationToolType =>
  useMemo(
    () => (selectionModeActive ? SELECT_TOOL_TYPE : annotationToolType),
    [annotationToolType, selectionModeActive]
  );
